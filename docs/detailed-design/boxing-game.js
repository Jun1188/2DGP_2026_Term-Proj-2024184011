/* PvE boxing prototype. Design numbers live in game-data.json; no external libraries. */
(() => {
  'use strict';
  const root = document.getElementById('boxingGame');
  const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num = value => Math.floor(value).toLocaleString('ko-KR');
  const names = ['A', 'B', 'C', 'D'];
  let D, cfg, sticks, nodes, neighbors, state, serial = 0;
  const layers = {frame:true, pieces:true, guardians:true, threat:true};
  let forced = '', previewId = null, editMode = false, editSelection = 'frame:ui', editorMessage = '';
  const layout = {scoreWidth:170, intelWidth:180, fontSize:14, accent:'#285d8f'};
  let drag = null;
  function random() {
    state.rng = (Math.imul(state.rng, 1664525) + 1013904223) >>> 0;
    return state.rng / 4294967296;
  }
  function shuffle(list) {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
  function log(message) {
    state.log.push({round:state.round + 1, turn:state.turn, message});
  }
  function instance(type) { return {uid:++serial, type, level:0}; }
  const piece = id => state.pieces[id];
  const activeGroups = () => state.groups.filter(g => g.pos !== 'END');
  const groupWeight = g => g.ids.reduce((n,id) => n + piece(id).weight, 0);
  const label = g => g.ids.map(id => names[id]).join('+');
  const rounds = () => D.run.acts[0].rounds;
  function drawHand() {
    while (state.hand.length < D.rules.handSize) {
      if (!state.draw.length) {
        state.draw = shuffle(state.discard);
        state.discard = [];
      }
      if (!state.draw.length) break;
      state.hand.push(state.draw.pop());
    }
  }
  function reset(seed) {
    serial = 0;
    state = {seed:seed >>> 0, rng:seed >>> 0, round:0, phase:'MENU', turn:0,
      deck:[], coins:D.economy.startCoins, charms:[], total:0, log:[], purchases:[],
      selected:[], hand:[], draw:[], discard:[], groups:[], pieces:[], guards:[], traps:[], score:0};
    const starter = D.starterDecks.find(d => d.id === 'woodcutter');
    for (const [id,count] of Object.entries(starter.sticks)) {
      for (let i=0;i<count;i++) state.deck.push(instance(id));
    }
    state.coins = starter.coins;
    forced = ''; previewId = null; editMode=false; editorMessage='';
    log('새 런. 메뉴에서 시작 덱을 선택하세요.');
    render();
  }
  function chooseDeck(id) {
    if (state.phase!=='MENU') return;
    const starter=D.starterDecks.find(d=>d.id===id);
    state.starter=id; state.deck=[]; state.coins=starter.coins;
    for(const [type,count] of Object.entries(starter.sticks)) for(let i=0;i<count;i++) state.deck.push(instance(type));
    state.phase='TRAIT';state.traitOffers=['standard',...shuffle(['shortcut','rush','fall']).slice(0,2)];log(starter.name+' 선택 · '+starter.modifier);render();
  }
  function startRound(traitId) {
    if (state.phase !== 'TRAIT') return;
    state.trait = D.roundTraits.find(t => t.id === traitId);
    const row = rounds()[state.round];
    state.target = Math.round(row.target * state.trait.targetX);
    state.phase = 'SELECT'; state.turn = 0; state.score = 0; state.reward = null;
    state.tosses = D.rules.tossesPerRound - (state.starter==='feather' ? 1 : 0) + (state.charms.includes('lucky') ? 1 : 0);
    state.swaps = D.rules.swapsPerRound; state.selected = []; state.pending = null;
    state.hand = []; state.discard = []; state.draw = shuffle(state.deck);
    state.pieces = names.map((_,id) => ({id, hp:cfg.pieceHealth, weight:0, effects:[], settled:false}));
    state.groups = names.map((_,id) => ({id, ids:[id], pos:null, route:'outer', history:[]}));
    state.traps = [];
    state.guards = [];
    const posts = D.rules.guardianCombat.posts.filter(p => p !== String(D.guardians.find(g => g.id === row.boss)?.start));
    for (let i=0;i<row.guardians;i++) {
      state.guards.push({id:'guard-'+i, kind:'guard', name:'수문장 '+(i+1), pos:posts[i % posts.length],
        hp:cfg.guardianHealth, maxHp:cfg.guardianHealth, attack:cfg.guardianAttack,
        range:cfg.guardianRange, ready:0, acted:-1});
    }
    if (row.boss) {
      const boss = D.guardians.find(g => g.id === row.boss);
      state.guards.push({id:boss.id, kind:boss.id, name:boss.name, pos:String(boss.start),
        hp:cfg.bossHealth, maxHp:cfg.bossHealth, attack:cfg.guardianAttack,
        range:cfg.bossRange, ready:0, acted:-1});
    }
    drawHand();
    log(row.id+' 시작 · '+state.trait.name+' · 목표 '+num(state.target)+'점.');
    render();
  }
  function inRange(guard, pos) {
    if (pos == null) return false;
    const target = pos === 'END' ? '0' : pos;
    let frontier = [guard.pos];
    const visited = new Set(frontier);
    for (let i=0;i<=guard.range;i++) {
      if (frontier.includes(target)) return true;
      frontier = frontier.flatMap(n => [...(neighbors[n] || [])]).filter(n => {
        if (visited.has(n)) return false;
        visited.add(n); return true;
      });
    }
    return false;
  }
  const intent = guard => state.turn % 3 === 2 ? '방어' : '공격';
  const nextIntent = () => (state.turn + 1) % 3 === 2 ? '방어' : '공격';
  function upgradeBonus(item) {
    return D.stickUpgrade.levels.filter(l => l.level <= item.level).reduce((v,l) => ({
      chips:v.chips+(l.bonus.chips||0), add:v.add+(l.bonus.addMult||0), x:v.x*(l.bonus.xMult||1)
    }), {chips:0, add:0, x:1});
  }
  function weightBase(pending, finishCount=0, captures=0, stackSize=1) {
    let chips = pending.hand.chips + finishCount * (D.rules.finishChipsPerPiece +
      (state.charms.includes('tortoise') ? 100 : 0)) * (state.trait.id === 'rush' ? 2 : 1);
    let add = pending.hand.mult, x = 1;
    const detail = [pending.hand.name+': Chips '+pending.hand.chips+' / Mult '+pending.hand.mult];
    pending.items.forEach((item,i) => {
      const s = sticks[item.type], b = upgradeBonus(item);
      chips += b.chips; add += b.add; x *= b.x;
      const on = s.trigger === 'always' || s.trigger === pending.faces[i];
      if (on) { chips += s.chips; add += s.addMult; x *= s.xMult; }
      if (on && s.special === 'sameFaceChips') chips += s.specialValue * pending.faces.filter((f,j) => i!==j && f===pending.faces[i]).length;
      detail.push(s.name+' +'+item.level+' '+(pending.faces[i] === 'flat' ? '배' : '등')+' · '+(on ? '발동' : '미발동'));
    });
    for (const family of D.families) {
      const count = pending.items.filter(i => sticks[i.type].family === family.id).length;
      const tier = Object.keys(family.bonus).map(Number).filter(n => n<=count).sort((a,b) => b-a)[0];
      if (!tier) continue;
      const b = family.bonus[tier]; chips += b.chips||0; add += b.addMult||0; x *= b.xMult||1;
    }
    if (pending.hand.id === 'backdo') add += 4;
    if (state.charms.includes('magpie') && pending.hand.id === 'gae') add += 3;
    const amount = Math.floor(chips * add * x * stackSize * D.rules.stackMultPerPiece * Math.pow(D.rules.captureMult,captures));
    return {amount, detail:detail.join(' → '), expression:num(chips)+' × '+num(add)+' × '+x+' × 업기 '+stackSize+' × 전투 '+Math.pow(D.rules.captureMult,captures)};
  }
  function probabilities(items) {
    const rows = {};
    for (let mask=0;mask<16;mask++) {
      let p=1, count=0, marked=false;
      items.forEach((item,i) => {
        const s=sticks[item.type], flat=!!(mask & (1<<i));
        p *= flat ? s.pFlat : 1-s.pFlat;
        if (flat) { count++; marked = !!s.marked; }
      });
      const hand = D.hands.find(h => count===1 && marked ? h.id==='backdo' : h.flats===count && !h.markedOnly);
      rows[hand.name] = (rows[hand.name]||0)+p;
    }
    return D.hands.map(h => h.name+' '+((rows[h.name]||0)*100).toFixed(1)+'%').join(' · ');
  }
  function toss() {
    if (state.phase !== 'SELECT' || state.selected.length !== D.rules.sticksPerToss || state.tosses<=0) return;
    const items = state.selected.map(uid => state.hand.find(i => i.uid===uid));
    if (forced === 'backdo' && !items.some(i => sticks[i.type].marked)) {
      log('빽도 고정에는 표시 윷을 포함해야 합니다.'); render(); return;
    }
    state.turn++; state.tosses--;
    const faces = items.map(i => random() < sticks[i.type].pFlat ? 'flat' : 'back');
    if (forced) {
      const forcedHand = D.hands.find(h => h.id===forced);
      faces.fill('back');
      if (forced==='backdo') faces[items.findIndex(i => sticks[i.type].marked)]='flat';
      else {
        // A normal 도 must not accidentally become 빽도.
        const order = items.map((_,i)=>i).sort((a,b)=>Number(!!sticks[items[a].type].marked)-Number(!!sticks[items[b].type].marked));
        order.slice(0,forcedHand.flats).forEach(i => faces[i]='flat');
      }
    }
    const flats = faces.filter(f => f==='flat').length;
    const backdo = flats===1 && sticks[items[faces.indexOf('flat')].type].marked;
    const hand = D.hands.find(h => backdo ? h.id==='backdo' : !h.markedOnly && h.flats===flats);
    state.pending = {items,faces,hand};
    state.hand = state.hand.filter(i => !state.selected.includes(i.uid));
    state.discard.push(...items); state.selected=[];
    if (D.rules.extraTossOn.includes(hand.id)) state.tosses++;
    log((forced ? '[고정 결과] ' : '')+hand.name+' · '+hand.move+'칸 · '+weightBase(state.pending).detail);
    if (state.trait.id==='fall' && random()<0.1) {
      if(D.rules.extraTossOn.includes(hand.id))state.tosses--;log('낙! 결과 무효. weight와 점수 증가 없음.'); finishTurn(); return;
    }
    state.phase='MOVE'; previewId=null;
    if (!activeGroups().some(g => hand.move>0 || g.pos!==null)) {
      log('판 위 말이 없어 빽도 이동·귀속 생략. 점수 증가 없음.'); finishTurn(); return;
    }
    render();
  }
  function plan(g) {
    const count=state.pending.hand.move;
    if (count<0) return g.pos==null ? [] : [g.history[g.history.length-1] || {pos:null,route:'outer'}];
    let route=g.route, pos=g.pos;
    if (pos==null) {pos='0'; route='outer';}
    if (state.trait.id!=='shortcut' && D.board.branchOnStop[pos]) route=D.board.branchOnStop[pos];
    const path=D.board.routes[route];
    let index=path.indexOf(pos);
    const out=[];
    for (let i=0;i<count;i++) {
      index++; pos=path[index] || 'END'; out.push({pos,route});
      if (pos==='END') break;
    }
    return out;
  }
  function capture(g) {
    for (const id of g.ids) Object.assign(piece(id),{hp:cfg.pieceHealth,weight:0,effects:[]});
    state.groups=state.groups.filter(x=>x!==g);
    for (const id of g.ids) state.groups.push({id,ids:[id],pos:null,route:'outer',history:[]});
    log(label(g)+' 전투 패배 / 출발 복귀. 미정산 weight·효과 초기화.');
  }
  function hurt(g,damage) {
    for (const id of g.ids) piece(id).hp=Math.max(0,piece(id).hp-damage);
    if (g.ids.some(id=>piece(id).hp===0)) {capture(g);return false;}
    return true;
  }
  function combat(g,guard) {
    const atk=g.ids.length*cfg.pieceAttack + Math.min(cfg.weightAttackCap,Math.floor(weightBase(state.pending).amount/cfg.weightAttackDivisor));
    const defense=intent(guard)==='방어' ? cfg.defenseBonus : 0;
    const damage=Math.max(1,atk-defense);
    guard.hp=Math.max(0,guard.hp-damage); guard.acted=state.turn;
    log(label(g)+' → '+guard.name+' 피해 '+damage+' / 적 HP '+guard.hp+'.');
    if (guard.hp===0) {
      guard.ready=state.turn+D.rules.guardianRespawnTosses;
      state.tosses+=D.rules.captureExtraToss;
      log(guard.name+' 처치 · 추가 투척 +'+D.rules.captureExtraToss+' · 이번 weight ×'+D.rules.captureMult+'.');
      return {alive:true,killed:true};
    }
    log(guard.name+' 반격 · 각 말 HP -'+guard.attack+'. 길목 이동 중단.');
    return {alive:hurt(g,guard.attack),killed:false};
  }
  function move(id) {
    if (state.phase!=='MOVE') return;
    let g=state.groups.find(x=>x.id===id);
    if (!g || g.pos==='END' || (g.pos==null && state.pending.hand.move<0)) return;
    let captures=0, alive=true;
    const path=plan(g), met=new Set();
    for (const step of path) {
      let blocked=false;
      for (const guard of state.guards.filter(q=>q.hp>0 && !met.has(q.id) && inRange(q,step.pos))) {
        met.add(guard.id);
        const result=combat(g,guard); alive=result.alive;
        if (result.killed) captures++; else blocked=true;
        if (!alive) break;
      }
      if (!alive || blocked) break;
      if (state.pending.hand.move<0) g.history.pop();
      else g.history.push({pos:g.pos,route:g.route});
      g.pos=step.pos;g.route=step.route;
      if (state.traps.includes(g.pos)) {
        state.traps=state.traps.filter(p=>p!==g.pos); capture(g); alive=false; break;
      }
    }
    if (alive) {
      const partner=state.groups.find(x=>x!==g && x.pos===g.pos && g.pos!=null && g.pos!=='END');
      if (partner) {
        g.ids=[...g.ids,...partner.ids].sort((a,b)=>a-b);
        state.groups=state.groups.filter(x=>x!==partner);
        log(label(g)+' 업기. 기존 weight 합계 보존.');
      }
      const finish=g.pos==='END';
      const value=weightBase(state.pending,finish ? g.ids.length : 0,captures,g.ids.length);
      const per=Math.floor(value.amount/g.ids.length), remainder=value.amount%g.ids.length;
      g.ids.forEach((id,i)=>{
        piece(id).weight+=per+(i<remainder ? 1 : 0);
        piece(id).effects.push(...state.pending.items.map((item,j)=>({turn:state.turn,type:item.type,level:item.level,face:state.pending.faces[j]})));
      });
      log(label(g)+' · '+value.expression+' = weight +'+num(value.amount)+' · 현재 '+num(groupWeight(g))+'.');
      if (finish) {
        const unsettled=g.ids.filter(id=>!piece(id).settled);
        const sum=unsettled.reduce((n,id)=>n+piece(id).weight,0);
        unsettled.forEach(id=>piece(id).settled=true);
        state.score+=sum;
        log(label(g)+' 완주 정산 +'+num(sum)+'점. 라운드 점수 '+num(state.score)+'.');
      } else log('미완주 → 라운드 점수 '+num(state.score)+' 유지.');
    }
    finishTurn();
  }
  function guardianPhase() {
    for (const guard of state.guards) {
      if (!guard.hp) {
        if (state.turn>=guard.ready) {guard.hp=guard.maxHp;guard.acted=state.turn;log(guard.name+' 원래 길목 '+guard.pos+'에 재등장.');}
        continue;
      }
      if (guard.acted===state.turn) continue;
      if (intent(guard)==='공격') {
        const targets=activeGroups().filter(g=>inRange(guard,g.pos));
        for (const g of targets) {log(guard.name+' 주둔 공격 → '+label(g)+' 각 HP -'+guard.attack);hurt(g,guard.attack);}
      }
      if (guard.kind==='goblin' && state.turn%3===0) {
        const occupied=new Set(state.groups.map(g=>g.pos));
        const cells=[...(neighbors[guard.pos]||[])].filter(p=>p!=='0' && !occupied.has(p) && !state.traps.includes(p) && !state.guards.some(g=>g.hp>0 && g.pos===p));
        if (cells.length) {const pos=cells[Math.floor(random()*cells.length)];state.traps.push(pos);log('도깨비: '+pos+'번에 함정 설치.');}
      }
    }
  }
  function finishTurn(runGuardians=true) {
    if(runGuardians)guardianPhase();
    previewId=null;
    if (state.score>=state.target) {
      const row=rounds()[state.round], E=D.economy;
      const base=Math.round(row.baseReward*state.trait.rewardX);
      const remaining=state.tosses*E.perRemainingToss;
      const interest=Math.min(E.interestCap+(state.starter==='peddler'?2:0),Math.floor(state.coins/E.interestPer));
      const overflow=state.score-state.target;
      const bonus=Math.floor(overflow/cfg.overflowStep)*cfg.overflowCoins;
      state.reward={base,remaining,interest,overflow,bonus,sum:base+remaining+interest+bonus};
      state.phase='REWARD';
      log('클리어 · 초과 '+num(overflow)+'점 · 보상 '+state.reward.sum+'냥(수령 대기).');
    } else if (state.tosses<=0 || !activeGroups().length) {
      state.phase='LOSE';log('런 종료. 정산 점수 '+num(state.score)+' / 목표 '+num(state.target)+'. 미완주 weight는 정산하지 않음.');
    } else {state.phase='SELECT';state.pending=null;drawHand();}
    render();
  }
  function swap() {
    if (state.phase!=='SELECT' || state.swaps<=0 || !state.selected.length || state.selected.length>D.rules.maxSwapCards) return;
    state.swaps--;
    const out=state.hand.filter(i=>state.selected.includes(i.uid));
    state.hand=state.hand.filter(i=>!state.selected.includes(i.uid));
    state.discard.push(...out); state.selected=[];drawHand();log('손패 '+out.length+'개 교체.');render();
  }
  function select(uid) {
    if (state.phase!=='SELECT') return;
    if (state.selected.includes(uid)) state.selected=state.selected.filter(i=>i!==uid);
    else if (state.selected.length<D.rules.sticksPerToss) state.selected.push(uid);
    render();
  }
  function shop() {
    if (state.phase!=='REWARD') return;
    state.coins+=state.reward.sum; state.total+=state.score;
    log('보상 '+state.reward.sum+'냥 수령 완료.');
    state.phase=state.round===rounds().length-1 ? 'WIN' : 'SHOP'; state.purchases=[];
    render();
  }
  function buy(type) {
    if (state.phase!=='SHOP' || state.purchases.includes(type)) return;
    const charm=D.charms.find(c=>c.id===type), s=sticks[type] || charm;
    if (!s || state.coins<s.price || (charm && state.charms.includes(type)) || (!charm && state.deck.length>=16)) return;
    state.coins-=s.price; state.purchases.push(type);
    if (charm) state.charms.push(type); else state.deck.push(instance(type));
    log(s.name+' 영입 · -'+s.price+'냥.');render();
  }
  function upgrade(uid) {
    if (state.phase!=='SHOP') return;
    const item=state.deck.find(i=>i.uid===uid);
    if (!item) return;
    const next=D.stickUpgrade.levels.find(l=>l.level===item.level+1);
    if (!next || state.coins<next.cost) return;
    state.coins-=next.cost;
    if (random()<next.success) {item.level++;log(sticks[item.type].name+' 강화 성공 +'+item.level);}
    else if (next.onFail==='break' && state.deck.length>D.rules.handSize && random()<(next.breakChance||0)) {
      state.deck=state.deck.filter(i=>i!==item);log(sticks[item.type].name+' 강화 실패 · 파괴.');
    } else {if (next.onFail!=='keep') item.level=Math.max(0,item.level-1);log(sticks[item.type].name+' 강화 실패 · 현재 +'+item.level);}
    render();
  }
  function scenario(kind) {
    // Scenarios start a separate new run so previous rewards and history cannot leak in.
    reset(state.seed);chooseDeck('woodcutter');startRound('standard');
    const g=state.groups[0];
    if (kind==='finish') {
      g.pos='19';g.history=[{pos:'18',route:'outer'}];piece(0).weight=state.target+cfg.overflowStep;
      forced='do';log('[장면 설정] A를 완주시키면 weight 정산·초과 보상으로 이어집니다.');
    } else if (kind==='combat') {
      g.pos='4';g.history=[{pos:'3',route:'outer'}];forced='do';log('[장면 설정] A → 5번 수문장 전투. 적 위치는 고정입니다.');
    } else if (kind==='failure') {
      state.tosses=1;forced='do';log('[장면 설정] 남은 투척 1. 미완주 weight는 실패 시 정산되지 않습니다.');
    }
    render();
  }
  function destination(g) {
    if (state.phase!=='MOVE' || (g.pos==null && state.pending.hand.move<0)) return '';
    const steps=plan(g), end=steps[steps.length-1]?.pos;
    const guards=state.guards.filter(q=>q.hp>0 && steps.some(p=>inRange(q,p.pos)));
    const value=weightBase(state.pending,end==='END'?g.ids.length:0,0,g.ids.length).amount;
    return ' → '+(end==='END'?'완주':end==null?'대기':end+'번')+' · '+(guards.length?'교전 '+guards.map(g=>g.name).join(', ')+' / ':'')+'기본 weight +'+num(value);
  }
  const disabled = condition => condition ? ' disabled' : '';
  function renderBoard() {
    const xy=pos=>{const n=nodes[pos==='END'?'0':pos];return n ? [70+n.x*80,70+n.y*80] : [0,0];};
    let board='', threat='', units='', guards='', preview='';
    for (const [id,list] of Object.entries(D.board.routes)) {
      const points=list.map(p=>xy(p).join(',')).join(' ');
      board+='<polyline points="'+points+'" class="box-route '+(id==='outer'?'':'diagonal')+'"/>';
    }
    for (const n of D.board.nodes) {
      const [x,y]=xy(n.id);
      board+='<circle data-edit-kind="node" data-edit-id="'+esc(n.id)+'" cx="'+x+'" cy="'+y+'" r="'+(n.tag?17:11)+'" class="box-node"/><text x="'+x+'" y="'+(y+29)+'" class="box-node-label">'+esc(n.id==='0'?'참먹이':n.id)+'</text>';
    }
    const danger=new Set();
    for (const guard of state.guards.filter(g=>g.hp>0)) for (const n of D.board.nodes) if (inRange(guard,n.id)) danger.add(n.id);
    for (const pos of danger) {const [x,y]=xy(pos);threat+='<circle cx="'+x+'" cy="'+y+'" r="26" class="box-danger"/>';}
    for (const pos of state.traps) {const [x,y]=xy(pos);threat+='<text x="'+x+'" y="'+(y+7)+'" class="box-trap">×</text>';}
    for (const guard of state.guards) {
      const [x,y]=xy(guard.pos);
      guards+='<g transform="translate('+x+','+y+')" data-edit-kind="guard" data-edit-id="'+esc(guard.id)+'" class="box-guard '+(!guard.hp?'fallen':'')+'"><title>'+esc(guard.name)+' · HP '+guard.hp+' · '+esc(guard.pos)+'번 상주</title><rect x="-17" y="-17" width="34" height="34" rx="3"/><text y="5">'+esc(guard.kind==='guard'?'守':'鬼')+'</text><text y="-24" class="box-guard-hp">'+guard.hp+'/'+guard.maxHp+'</text></g>';
    }
    const positions={};
    for (const g of state.groups.filter(g=>g.pos!=null && g.pos!=='END')) {
      const [x,y]=xy(g.pos), occupied=state.guards.some(q=>q.hp>0 && q.pos===g.pos);
      const offset=(positions[g.pos]||0)*20;positions[g.pos]=(positions[g.pos]||0)+1;
      units+='<g transform="translate('+(x+offset)+','+(y+(occupied?30:0))+')" class="box-piece" data-edit-kind="piece" data-edit-id="'+g.id+'" role="button" tabindex="0" data-move="'+g.id+'" aria-label="'+esc(label(g)+destination(g))+'"><title>'+esc(label(g)+' · weight '+groupWeight(g))+'</title><circle r="18"/><text y="5">'+esc(label(g))+'</text><text y="-25" class="box-piece-weight">W '+num(groupWeight(g))+'</text></g>';
    }
    if (previewId!=null && state.phase==='MOVE') {
      const g=state.groups.find(g=>g.id===previewId);
      if (g) for (const step of plan(g)) {
        if (step.pos==null) continue;
        const [x,y]=xy(step.pos);preview+='<circle cx="'+x+'" cy="'+y+'" r="22" class="box-preview"/>';
      }
    }
    const layer=(id,body)=>'<g data-layer="'+id+'"'+(!layers[id]?' style="display:none"':'')+'>'+body+'</g>';
    return '<svg viewBox="0 0 540 540" role="img" aria-label="플레이 가능한 윷판. 파란 원은 내 말, 붉은 사각형은 고정 수문장, 붉은 원은 공격 범위입니다.">'+
      '<g data-layer="board">'+board+'</g>'+layer('threat',threat)+'<g data-layer="preview">'+preview+'</g>'+layer('guardians',guards)+layer('pieces',units)+
      layer('frame','<path d="M15 48V15H48 M492 15H525V48 M525 492V525H492 M48 525H15V492" class="box-frame-line"/><text x="270" y="30" class="box-frame-title">YUTOCHESS · TACTICAL BOARD</text>')+'</svg>';
  }
  function stagePanel() {
    if (state.phase==='MENU') return '<h4>메뉴 · 덱 특성 세팅</h4><p>시작 덱을 골라 플레이를 시작하세요. 시드와 표시 설정은 위쪽 새 런, 아래쪽 게임 설정에서 바꿉니다.</p><div class="box-offers">'+D.starterDecks.map(d=>'<button type="button" data-start="'+d.id+'"><b>'+esc(d.name)+' · '+d.coins+'냥</b><span>'+esc(Object.entries(d.sticks).map(([id,n])=>sticks[id].name+' '+n).join(', '))+'</span><small>'+esc(d.modifier)+'</small><b>이 덱으로 시작 →</b></button>').join('')+'</div><details><summary>게임 설정</summary><label>표시 크기 <select id="boxScale">'+[12,14,16,18].map(n=>'<option value="'+n+'"'+(layout.fontSize===n?' selected':'')+'>'+n+'px</option>').join('')+'</select></label><p>런 시드로 난수를 고정합니다. 레이어 표시·장면 편집·고정 결과는 박싱 머신에서 설정합니다.</p></details>';
    if (state.phase==='TRAIT') return '<h4>라운드 '+(state.round+1)+' · 조건 선택</h4><p>완주한 말의 weight로 목표를 채우세요.</p><div class="box-offers">'+(state.traitOffers||['standard','shortcut','rush']).map(id=>{
      const t=D.roundTraits.find(t=>t.id===id);
      return '<button type="button" data-trait="'+id+'"><b>'+esc(t.name)+'</b><span>'+esc(t.effect)+'</span><small>목표 ×'+t.targetX+' · 보상 ×'+t.rewardX+'</small></button>';
    }).join('')+'</div>';
    if (state.phase==='REWARD') {
      const r=state.reward;
      return '<h4>라운드 클리어</h4><p>완주 정산 '+num(state.score)+' / 목표 '+num(state.target)+'</p><dl class="box-rewards"><dt>기본 보상</dt><dd>'+r.base+'냥</dd><dt>남은 투척</dt><dd>'+r.remaining+'냥</dd><dt>이자</dt><dd>'+r.interest+'냥</dd><dt>초과 '+num(r.overflow)+'점</dt><dd>+'+r.bonus+'냥</dd><dt>수령할 보상</dt><dd>'+r.sum+'냥</dd></dl><button type="button" class="box-primary" data-action="shop">'+(state.round===2?'보상 받기 → 막 결과':'보상 받기 → 상점')+'</button>';
    }
    if (state.phase==='SHOP') {
      return '<h4>상점 · 다음 길목 준비</h4><p>보유 '+state.coins+'냥 · 덱 '+state.deck.length+'/16 · 각 상품 1회 구매</p><div class="box-offers">'+['lead','flame','bamboo','magpie','tortoise','lucky'].map(id=>{
        const s=sticks[id]||D.charms.find(c=>c.id===id);
        return '<button type="button" data-buy="'+id+'"'+disabled(state.coins<s.price||state.purchases.includes(id)||state.charms.includes(id)|| (!!sticks[id] && state.deck.length>=16))+'><b>'+esc(s.name)+' · '+s.price+'냥</b><span>'+esc(s.effect)+'</span></button>';
      }).join('')+'</div><label class="box-upgrade">강화할 윷 <select id="boxUpgrade">'+state.deck.map(i=>'<option value="'+i.uid+'">'+esc(sticks[i.type].name)+' #'+i.uid+' +'+i.level+' → '+(D.stickUpgrade.levels[i.level] ? D.stickUpgrade.levels[i.level].cost+'냥 / '+Math.round(D.stickUpgrade.levels[i.level].success*100)+'%' : '최대 강화')+'</option>').join('')+'</select></label><button type="button" data-action="upgrade">선택한 윷 강화 시도</button> <button type="button" data-action="remove">윷 제거</button> <button type="button" data-action="sell">윷 판매</button><p class="box-muted">강화 비용·성공률은 선택 목록에 표시합니다. 제거는 ' + D.economy.removeStickCost + '냥, 판매는 원가의 절반. 덱은 최소 손패 수를 유지합니다.</p><button type="button" class="box-primary" data-action="next">다음 라운드 조건 선택</button>';
    }
    if (state.phase==='WIN'||state.phase==='LOSE') return '<h4>'+(state.phase==='WIN'?'1막 완주 · 승리':'런 종료')+'</h4><p>이번 라운드 '+num(state.score)+' / '+num(state.target)+'점<br>클리어한 라운드 총점 '+num(state.total)+' · 엽전 '+state.coins+'냥</p><button type="button" class="box-primary" data-action="reset">같은 시드로 새 런</button>';
    return '';
  }
  function editDeck(action) {
    if(state.phase!=='SHOP')return;
    const uid=+root.querySelector('#boxUpgrade').value, item=state.deck.find(i=>i.uid===uid);
    if(!item)return;
    if(state.deck.length<=D.rules.handSize){log('덱은 손패 수보다 줄일 수 없습니다.');render();return;}
    if(action==='remove' && state.coins<D.economy.removeStickCost){log('제거할 엽전이 부족합니다.');render();return;}
    state.coins+=action==='sell'?Math.floor(sticks[item.type].price*D.economy.sellRatio):-D.economy.removeStickCost;
    state.deck=state.deck.filter(i=>i!==item);log(sticks[item.type].name+(action==='sell'?' 판매.':' 제거.'));render();
  }
  function editorPanel() {
    const options=[['frame:ui','UI 프레임'],['rules:round','라운드 자원'],...Object.keys(nodes).map(id=>['node:'+id,'보드 칸 '+id]),
      ...activeGroups().map(g=>['piece:'+g.id,'말 '+label(g)]),...state.guards.map(g=>['guard:'+g.id,g.name])];
    if(!options.some(([id])=>id===editSelection))editSelection='frame:ui';
    const [kind,id]=editSelection.split(':');
    const field=(key,title,value,min=0,max=10000,step=1)=>'<label>'+title+'<input type="number" data-edit-field="'+key+'" value="'+value+'" min="'+min+'" max="'+max+'" step="'+step+'"></label>';
    const position=value=>'<label>배치할 칸<select data-edit-field="pos">'+(kind==='piece'?'<option value="WAIT"'+(value==null?' selected':'')+'>출발 대기</option>':'')+Object.keys(nodes).map(pos=>'<option value="'+pos+'"'+(value===pos?' selected':'')+'>'+pos+'번</option>').join('')+'</select></label>';
    let fields='';
    if(kind==='frame')fields=field('scoreWidth','점수 패널 너비(px)',layout.scoreWidth,120,280)+field('intelWidth','수문장 패널 너비(px)',layout.intelWidth,130,280)+field('fontSize','게임 글자 크기(px)',layout.fontSize,12,20)+'<label>말 / UI 강조색<input type="color" data-edit-field="accent" value="'+layout.accent+'"></label>';
    if(kind==='rules')fields=field('target','목표 점수',state.target||600,1,1000000000)+field('tosses','남은 투척',state.tosses??7,0,99)+field('swaps','남은 교체',state.swaps??3,0,99)+field('coins','보유 엽전',state.coins,0,1000000000);
    if(kind==='node')fields=field('x','X 좌표(시각 배치)',nodes[id].x,0,5,.01)+field('y','Y 좌표(시각 배치)',nodes[id].y,0,5,.01);
    if(kind==='piece') {
      const g=state.groups.find(g=>String(g.id)===id);
      fields=position(g.pos)+field('weight','묶음 weight 합계',groupWeight(g),0,1000000000)+field('hp','구성 말 각각의 HP',piece(g.ids[0]).hp,1,100);
    }
    if(kind==='guard') {
      const g=state.guards.find(g=>g.id===id);
      fields=position(g.pos)+field('maxHp','최대 HP',g.maxHp,1,100)+field('hp','현재 HP',g.hp,0,100)+field('attack','공격력',g.attack,0,100)+field('range','공격 범위(그래프 거리)',g.range,0,5);
    }
    return '<div class="box-editor"><h4>장면 편집기 · 턴 진행 일시정지</h4><label>편집 대상 <select id="boxEditObject">'+options.map(([value,title])=>'<option value="'+value+'"'+(value===editSelection?' selected':'')+'>'+esc(title)+'</option>').join('')+'</select></label><div class="box-editor-grid">'+fields+'</div><button type="button" class="box-primary" data-action="apply-edit">변경 적용</button> <button type="button" data-action="export">장면 JSON 저장</button><p class="box-editor-message" role="status">'+esc(editorMessage)+'</p><p class="box-muted">보드 칸은 드래그로 시각 좌표를 바꿉니다. 말·수문장은 드래그한 가장 가까운 칸으로 배치합니다. 시각 좌표를 옮겨도 경로 연결은 유지합니다. 출발 대기 말은 위 목록에서 고르세요. 편집한 상태는 사건 기록과 함께 저장됩니다.</p></div>';
  }
  function warpGroup(g,pos) {
    g.pos=pos;
    if(pos==null){g.route='outer';g.history=[];return;}
    if(!D.board.routes[g.route].includes(pos))g.route=Object.keys(D.board.routes).find(r=>D.board.routes[r].includes(pos));
    const route=D.board.routes[g.route], index=route.indexOf(pos);
    g.history=route.slice(0,index).map(p=>({pos:p==='0'?null:p,route:g.route}));
  }
  function applyEditor() {
    if(!editMode)return;
    try {
      const values=Object.fromEntries([...root.querySelectorAll('[data-edit-field]')].map(el=>[el.dataset.editField,el.value]));
      const read=(key,min,max,integer=true)=>{
        if(values[key]==='' || !Number.isFinite(+values[key]) || +values[key]<min || +values[key]>max || (integer&&!Number.isInteger(+values[key])))throw new Error(key+' 범위: '+min+'~'+max);
        return +values[key];
      };
      const [kind,id]=editSelection.split(':');
      if(kind==='frame') {
        const scoreWidth=read('scoreWidth',120,280),intelWidth=read('intelWidth',130,280),fontSize=read('fontSize',12,20);
        if(!/^#[0-9a-f]{6}$/i.test(values.accent))throw new Error('색상은 HEX 6자리입니다.');
        Object.assign(layout,{scoreWidth,intelWidth,fontSize,accent:values.accent});
      }
      if(kind==='node'){const x=read('x',0,5,false),y=read('y',0,5,false);Object.assign(nodes[id],{x,y});}
      if(kind==='rules') {
        if(!['SELECT','MOVE'].includes(state.phase))throw new Error('라운드 시작 후 자원을 편집하세요.');
        const target=read('target',1,1000000000),tosses=read('tosses',0,99),swaps=read('swaps',0,99),coins=read('coins',0,1000000000);
        Object.assign(state,{target,tosses,swaps,coins});
      }
      if(kind==='piece') {
        const g=state.groups.find(g=>String(g.id)===id),weight=read('weight',0,1000000000),hp=read('hp',1,100);
        const pos=values.pos==='WAIT'?null:values.pos;if(pos!=null&&!nodes[pos])throw new Error('없는 칸입니다.');
        warpGroup(g,pos);g.ids.forEach((id,i)=>{piece(id).weight=Math.floor(weight/g.ids.length)+(i<weight%g.ids.length?1:0);piece(id).hp=hp;});
      }
      if(kind==='guard') {
        const g=state.guards.find(g=>g.id===id),maxHp=read('maxHp',1,100),hp=read('hp',0,100),attack=read('attack',0,100),range=read('range',0,5);
        if(hp>maxHp || !nodes[values.pos])throw new Error('현재 HP는 최대 HP 이하이고 배치 칸은 유효해야 합니다.');
        Object.assign(g,{pos:values.pos,maxHp,hp,attack,range,ready:state.turn+D.rules.guardianRespawnTosses});
      }
      log('[편집] '+editSelection+' 변경 적용.');editorMessage='적용했습니다. 편집 종료 후 같은 장면에서 플레이하세요.';
    }catch(error){editorMessage=error.message;}
    render();
  }
  function saveScene() {
    const snapshot={kind:'yutochess-boxing-scene',version:1,dataVersion:D.version,config:cfg,layout:{...layout},layers:{...layers},nodePositions:Object.values(nodes),forced,state};
    const blob=new Blob(['\uFEFF'+JSON.stringify(snapshot,null,2)],{type:'application/json;charset=utf-8'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='yutochess-boxing-'+state.seed+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function loadScene(input) {
    const check=(condition,message)=>{if(!condition)throw new Error(message);};
    const int=(value,min,max)=>Number.isInteger(value)&&value>=min&&value<=max;
    const array=(value,max)=>Array.isArray(value)&&value.length<=max;
    const position=value=>value==null||value==='END'||Object.hasOwn(nodes,value);
    check(input?.kind==='yutochess-boxing-scene'&&input.version===1&&input.dataVersion===D.version,'현재 기획 데이터 버전의 장면 JSON을 선택하세요.');
    const q=input.state, ui=input.layout;
    check(q&&ui&&array(q.deck,16)&&q.deck.length>=D.rules.handSize,'덱 데이터가 없습니다.');
    check(['MENU','TRAIT','SELECT','MOVE','REWARD','SHOP','WIN','LOSE'].includes(q.phase),'진행 상태가 유효하지 않습니다.');
    if(q.phase==='TRAIT')check(array(q.traitOffers,3)&&q.traitOffers.length===3&&q.traitOffers.every(id=>['standard','shortcut','rush','fall'].includes(id)),'특성 선택지 값 오류');
    check(int(q.round,0,2)&&int(q.turn,0,10000)&&int(q.seed,0,4294967295)&&int(q.rng,0,4294967295),'라운드/시드 값 오류');
    check(int(q.coins,0,1000000000)&&int(q.score,0,1000000000000)&&int(q.total,0,1000000000000),'점수/재화 값 오류');
    if(!['MENU','TRAIT'].includes(q.phase))check(int(q.target,1,1000000000)&&int(q.tosses,0,10000)&&int(q.swaps,0,99),'라운드 자원 값 오류');
    const validItem=i=>i&&['wood','marked','lead','feather','flame','bamboo'].includes(i.type)&&int(i.uid,1,1000000)&&int(i.level,0,D.stickUpgrade.maxLevel);
    check(q.deck.every(validItem)&&new Set(q.deck.map(i=>i.uid)).size===q.deck.length,'윷 ID/강화 값 오류');
    const byUid=new Map(q.deck.map(i=>[i.uid,{uid:i.uid,type:i.type,level:i.level}]));
    for(const key of ['hand','draw','discard'])check(array(q[key],16)&&q[key].every(validItem),'손패/더미 값 오류');
    if(['SELECT','MOVE'].includes(q.phase)) {
      const all=[...q.hand,...q.draw,...q.discard].map(i=>i.uid);
      check(all.length===q.deck.length&&new Set(all).size===all.length&&all.every(id=>byUid.has(id)),'손패·더미가 덱과 일치하지 않습니다.');
    }
    check(array(q.selected,4)&&new Set(q.selected).size===q.selected.length&&q.selected.every(id=>q.hand.some(i=>i.uid===id)),'선택한 윷 값 오류');
    check(array(q.pieces,4)&&array(q.groups,4)&&array(q.guards,8)&&array(q.traps,29)&&q.traps.every(p=>Object.hasOwn(nodes,p)),'장면 개체 값 오류');
    if(q.pieces.length) {
      check(q.pieces.length===4&&q.pieces.every((p,i)=>p.id===i&&int(p.hp,0,100)&&int(p.weight,0,1000000000)&&typeof p.settled==='boolean'&&array(p.effects,100000)),'말 상태 값 오류');
      const ids=q.groups.flatMap(g=>Array.isArray(g.ids)?g.ids:[]);
      check(ids.length===4&&new Set(ids).size===4&&ids.every(id=>int(id,0,3)),'묶음 구성 오류');
      check(new Set(q.groups.map(g=>g.id)).size===q.groups.length&&q.groups.every(g=>g.ids.includes(g.id)&&position(g.pos)&&Object.hasOwn(D.board.routes,g.route)&&
        (g.pos==null||D.board.routes[g.route].includes(g.pos))&&array(g.history,10000)&&g.history.every(h=>position(h.pos)&&Object.hasOwn(D.board.routes,h.route))),'말 경로 값 오류');
      check(q.groups.every(g=>g.ids.every(id=>q.pieces[id].settled===(g.pos==='END'))),'완주 정산 상태 오류');
    } else check(['MENU','TRAIT'].includes(q.phase)&&q.groups.length===0,'말이 없는 라운드입니다.');
    check(q.guards.every(g=>typeof g.id==='string'&&/^[a-z0-9-]{1,40}$/.test(g.id)&&typeof g.name==='string'&&g.name.length<80&&
      D.guardians.some(d=>d.id===g.kind)&&Object.hasOwn(nodes,g.pos)&&int(g.maxHp,1,100)&&int(g.hp,0,g.maxHp)&&int(g.attack,0,100)&&int(g.range,0,5)&&int(g.ready,0,10002)&&int(g.acted,-1,10000)),'수문장 상태 값 오류');
    check(array(q.charms,5)&&q.charms.every(id=>['magpie','tortoise','lucky'].includes(id))&&array(q.purchases,20)&&q.purchases.every(id=>Object.hasOwn(sticks,id)||D.charms.some(c=>c.id===id)),'상점 상태 값 오류');
    check(array(q.log,100000)&&q.log.every(e=>int(e.round,1,3)&&int(e.turn,0,10000)&&typeof e.message==='string'&&e.message.length<4000),'사건 기록 값 오류');
    if(q.phase==='REWARD')check(q.reward&&['base','remaining','interest','overflow','bonus','sum'].every(k=>int(q.reward[k],0,1000000000000))&&q.reward.sum===q.reward.base+q.reward.remaining+q.reward.interest+q.reward.bonus,'보상 정산 값 오류');
    if(q.phase==='MOVE')check(q.pending&&array(q.pending.items,4)&&q.pending.items.length===4&&q.pending.items.every(i=>validItem(i)&&byUid.has(i.uid))&&array(q.pending.faces,4)&&q.pending.faces.length===4&&q.pending.faces.every(f=>['flat','back'].includes(f))&&D.hands.some(h=>h.id===q.pending.hand?.id),'투척 결과 값 오류');
    check(int(ui.scoreWidth,120,280)&&int(ui.intelWidth,130,280)&&int(ui.fontSize,12,20)&&/^#[0-9a-f]{6}$/i.test(ui.accent),'UI 배치 값 오류');
    check(array(input.nodePositions,29)&&input.nodePositions.length===29&&new Set(input.nodePositions.map(n=>n.id)).size===29&&input.nodePositions.every(n=>Object.hasOwn(nodes,n.id)&&Number.isFinite(n.x)&&Number.isFinite(n.y)&&n.x>=0&&n.x<=5&&n.y>=0&&n.y<=5),'보드 좌표 값 오류');
    check(input.forced===''||D.hands.some(h=>h.id===input.forced),'고정 투척 값 오류');
    check(input.config&&Object.keys(cfg).every(key=>typeof cfg[key]!=='number'||input.config[key]===cfg[key]),'현재 박싱 전투 설정과 다른 장면입니다.');
    const restored=structuredClone(q);
    restored.deck=[...byUid.values()];
    for(const key of ['hand','draw','discard'])restored[key]=q[key].map(i=>byUid.get(i.uid)||{uid:i.uid,type:i.type,level:i.level});
    if(restored.trait) {
      restored.trait=D.roundTraits.find(t=>t.id===restored.trait.id);
      check(!!restored.trait,'라운드 특성 값 오류');
    }
    if(q.phase==='MOVE')restored.pending={items:q.pending.items.map(i=>byUid.get(i.uid)),faces:[...q.pending.faces],hand:D.hands.find(h=>h.id===q.pending.hand.id)};
    else restored.pending=null;
    check(['MENU','TRAIT'].includes(q.phase)||!!restored.trait,'라운드 특성이 없습니다.');
    state=restored;serial=Math.max(0,...state.deck.map(i=>i.uid));
    Object.assign(layout,{scoreWidth:ui.scoreWidth,intelWidth:ui.intelWidth,fontSize:ui.fontSize,accent:ui.accent});
    for(const node of input.nodePositions)Object.assign(nodes[node.id],{x:node.x,y:node.y});
    for(const key of Object.keys(layers))if(typeof input.layers?.[key]==='boolean')layers[key]=input.layers[key];
    forced=input.forced;editMode=true;previewId=null;editorMessage='장면을 복원했습니다. 편집 종료 후 이어서 플레이하세요.';
    log('[장면] 저장한 상태·난수·배치 복원.');render();
  }
  root.addEventListener('pointerdown',event=>{
    if(!editMode || event.button!==0)return;
    const target=event.target.closest('[data-edit-kind]');if(!target)return;
    event.preventDefault();editSelection=target.dataset.editKind+':'+target.dataset.editId;
    drag={kind:target.dataset.editKind,id:target.dataset.editId,pointer:event.pointerId,moved:false};
    root.setPointerCapture(event.pointerId);
  });
  root.addEventListener('pointermove',event=>{
    if(!drag || drag.pointer!==event.pointerId)return;
    const svg=root.querySelector('.box-board svg'), matrix=svg?.getScreenCTM();if(!matrix)return;
    const point=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse());
    const x=Math.max(0,Math.min(5,(point.x-70)/80)),y=Math.max(0,Math.min(5,(point.y-70)/80));
    if(drag.kind==='node')Object.assign(nodes[drag.id],{x:Math.round(x*100)/100,y:Math.round(y*100)/100});
    else {
      const nearest=Object.values(nodes).sort((a,b)=>Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y))[0].id;
      if(drag.kind==='guard')state.guards.find(g=>g.id===drag.id).pos=nearest;
      if(drag.kind==='piece')warpGroup(state.groups.find(g=>String(g.id)===drag.id),nearest);
    }
    drag.moved=true;svg.outerHTML=renderBoard();
  });
  function endDrag(event){
    if(!drag||event.pointerId!==drag.pointer)return;
    if(root.hasPointerCapture(drag.pointer))root.releasePointerCapture(drag.pointer);
    if(drag.moved)log('[편집] '+editSelection+' 드래그 배치 적용.');
    drag=null;render();
  }
  root.addEventListener('pointerup',endDrag);
  root.addEventListener('pointercancel',endDrag);

  function render() {
    const hadFocus=root.contains(document.activeElement);
    root.classList.toggle('editing',editMode);
    root.style.setProperty('--box-score-width',layout.scoreWidth+'px');
    root.style.setProperty('--box-intel-width',layout.intelWidth+'px');
    root.style.setProperty('--box-accent',layout.accent);root.style.fontSize=layout.fontSize+'px';
    const phaseName={MENU:'메뉴',TRAIT:'조건 선택',SELECT:'윷 선택',MOVE:'이동 / 전투',REWARD:'보상',SHOP:'상점',WIN:'막 결과',LOSE:'런 종료'};
    const chosen=state.selected.map(uid=>state.hand.find(i=>i.uid===uid));
    const pct=state.target ? Math.min(100,state.score/state.target*100) : 0;
    root.innerHTML='<div class="box-top"><div><span class="box-eyebrow">PLAYABLE BOXING / ACT 01</span><h3>길목을 돌파하고, 가치를 가져오세요.</h3></div><label>런 시드 <input id="boxSeed" type="number" min="0" max="4294967295" value="'+state.seed+'"></label><button type="button" data-action="reset">메뉴 / 새 런</button><button type="button" data-action="editor" aria-pressed="'+editMode+'">'+(editMode?'편집 종료 → 플레이':'편집 모드')+'</button></div>'+
      '<div class="box-loop">'+['MENU','TRAIT','SELECT','REWARD','SHOP'].map((p,i)=>'<span'+((state.phase===p||(p==='SELECT'&&state.phase==='MOVE'))?' class="current"':'')+'>'+(i?' → ':'')+(state.phase===p?'<b>':'')+({MENU:'메뉴·덱 세팅',TRAIT:'라운드 특성',SELECT:'PvE',REWARD:'보상',SHOP:'상점·덱 편집'}[p])+(state.phase===p?'</b>':'')+'</span>').join('')+' → 다음 라운드 / 결과</div><div class="box-status" aria-live="polite"><b>1막 · '+(state.round+1)+'라운드</b><span>'+phaseName[state.phase]+'</span><span>투척 <b>'+ (state.tosses??'—')+'</b></span><span>교체 '+(state.swaps??'—')+'</span><span>엽전 <b>'+state.coins+'</b></span><span>덱 '+state.deck.length+'</span></div>'+
      (editMode?editorPanel():'')+'<div class="box-layout"><aside class="box-score"><span class="box-eyebrow">SETTLED SCORE</span><div class="box-score-number">'+num(state.score)+'</div><p>목표 '+(state.target?num(state.target):'—')+'</p><div class="box-progress"><i style="width:'+pct+'%"></i></div><p class="box-muted">완주 전 weight는 이 점수에 포함되지 않습니다.</p><h4>내 말 / 미정산 가치</h4><div class="box-roster">'+state.groups.map(g=>'<button type="button" data-preview="'+g.id+'" data-move="'+g.id+'"'+disabled(editMode||state.phase!=='MOVE'||g.pos==='END'||(g.pos==null&&state.pending?.hand.move<0))+'><b>'+esc(label(g))+'</b><span>'+esc(g.pos==='END'?'완주·정산됨':g.pos==null?'출발 대기':g.pos+'번')+'</span><span>W '+num(groupWeight(g))+' · HP '+g.ids.map(id=>piece(id).hp).join('/')+'</span><small>'+esc(destination(g))+'</small></button>').join('')+'</div></aside>'+
      '<div class="box-board">'+renderBoard()+'<p class="box-board-key"><span>● 내 말</span><span>■ 상주 수문장</span><span>◌ 공격 범위</span><span>× 함정</span></p></div>'+
      '<aside class="box-intel"><span class="box-eyebrow">GATE INTELLIGENCE</span><h4>주둔지 / 예고</h4>'+state.guards.map(g=>'<div class="box-enemy"><b>'+esc(g.name)+' · '+esc(g.pos)+'번</b><span>HP '+g.hp+'/'+g.maxHp+' · 사거리 '+g.range+'</span><span>'+(g.hp?'다음 행동: '+(state.phase==='MOVE'?intent(g):nextIntent()):'재등장까지 '+Math.max(0,g.ready-state.turn)+'투척')+'</span></div>').join('')+'<h4>이번 투척</h4><p>'+(state.pending?esc(state.pending.hand.name)+' / '+state.pending.faces.map(f=>f==='flat'?'배':'등').join(' · '):'손패에서 윷 4개를 선택하세요.')+'</p><p class="box-muted">'+(state.phase==='MOVE'?'왼쪽 말 버튼을 누르면 이동·전투를 확정합니다. 올려두면 경로를 표시합니다.':'적은 주둔 칸에서만 전투합니다. 범위에 진입하면 공격과 반격을 처리합니다.')+'</p><h4>부적</h4><p>'+esc(state.charms.map(id=>D.charms.find(c=>c.id===id).name).join(' · ')||'없음')+'</p></aside></div>'+
      (['SELECT','MOVE'].includes(state.phase)?'<div class="box-hand-area"><div class="box-hand-heading"><h4>손패 <small>'+state.selected.length+'/4 선택 · 뽑을 더미 '+state.draw.length+' / 버림 '+state.discard.length+'</small></h4><div><button type="button" data-action="swap"'+disabled(editMode||state.phase!=='SELECT'||!state.selected.length||state.swaps<=0)+'>교체</button> <button type="button" class="box-primary" data-action="toss"'+disabled(editMode||state.phase!=='SELECT'||state.selected.length!==4)+'>던지기</button></div></div><div class="box-hand">'+state.hand.map((i,index)=>{
        const s=sticks[i.type], picked=state.selected.includes(i.uid);
        return '<button type="button" class="box-card '+(picked?'chosen':'')+'" data-card="'+i.uid+'" aria-pressed="'+picked+'"'+disabled(editMode||state.phase!=='SELECT')+'><small>'+(index+1)+' · '+esc(s.family)+'</small><div class="box-stick '+(s.marked?'marked':'')+'">'+(s.marked?'×':'')+'</div><b>'+esc(s.name)+' +'+i.level+'</b><span>배 '+Math.round(s.pFlat*100)+'% · Chips '+s.chips+'</span><small>'+esc(s.effect)+'</small></button>';
      }).join('')+'</div><p class="box-prob">'+(chosen.length===4?esc(probabilities(chosen)):'1~6 키로 선택 · Space 던지기 · R 교체 (게임 영역에 포커스가 있을 때)')+'</p></div>':'')+
      '<div class="box-stage">'+stagePanel()+'</div><details class="box-tools"><summary>박싱 머신 · 레이어 / 고정 장면 / 기록</summary><div class="box-tool-grid"><fieldset><legend>표시 레이어</legend>'+[['frame','UI 프레임'],['pieces','말'],['guardians','수문장'],['threat','공격 범위·함정']].map(([id,name])=>'<label><input type="checkbox" data-layer-toggle="'+id+'"'+(layers[id]?' checked':'')+'> '+name+'</label>').join('')+'</fieldset><label>투척 결과 <select id="boxForced"><option value="">시드 난수</option>'+D.hands.map(h=>'<option value="'+h.id+'"'+(forced===h.id?' selected':'')+'>'+esc(h.name)+' 고정</option>').join('')+'</select></label><div><p>별도 새 런으로 장면 열기</p><button type="button" data-scenario="finish">완주·초과 보상</button> <button type="button" data-scenario="combat">길목 전투</button> <button type="button" data-scenario="failure">투척 소진</button></div><button type="button" data-action="export">장면·사건 기록 저장</button><label>장면 불러오기 <input id="boxScene" type="file" accept="application/json,.json"></label></div><p>박싱 전용 초기값: 말 HP '+cfg.pieceHealth+' / 공격 '+cfg.pieceAttack+', 수문장 HP '+cfg.guardianHealth+' / 반격 '+cfg.guardianAttack+'. 업힌 말은 공격력을 합칩니다. 초과 '+cfg.overflowStep+'점당 '+cfg.overflowCoins+'냥은 조정용 가정입니다.</p></details>'+
      '<details class="box-events" open><summary>사건 기록 · '+state.log.length+'건</summary><ol>'+state.log.slice(-50).reverse().map(e=>'<li><small>'+e.round+'R / '+e.turn+'T</small> '+esc(e.message)+'</li>').join('')+'</ol></details>';
    if(hadFocus)root.focus({preventScroll:true});
  }
  root.addEventListener('click', e => {
    const editTarget=e.target.closest('[data-edit-kind]');
    if(editMode && editTarget){editSelection=editTarget.dataset.editKind+':'+editTarget.dataset.editId;render();return;}
    const button=e.target.closest('button,[data-move]');
    if (!button || button.disabled) return;
    if(button.dataset.action==='editor'){editMode=!editMode;editorMessage='';if(!editMode&&state.phase==='SELECT'&&(state.score>=state.target||state.tosses<=0||!activeGroups().length))finishTurn(false);else render();return;}
    if(button.dataset.action==='apply-edit'){applyEditor();return;}
    if(editMode && !['export','reset'].includes(button.dataset.action))return;
    if(button.dataset.start)return chooseDeck(button.dataset.start);
    if (button.dataset.card) return select(+button.dataset.card);
    if (button.dataset.move!=null) return move(+button.dataset.move);
    if (button.dataset.trait) return startRound(button.dataset.trait);
    if (button.dataset.buy) return buy(button.dataset.buy);
    if (button.dataset.scenario) return scenario(button.dataset.scenario);
    switch(button.dataset.action) {
      case 'toss': toss(); break;
      case 'swap': swap(); break;
      case 'shop': shop(); break;
      case 'next': if(state.phase==='SHOP'){state.round++;state.phase='TRAIT';state.traitOffers=['standard',...shuffle(['shortcut','rush','fall']).slice(0,2)];render();} break;
      case 'remove': editDeck('remove'); break;
      case 'sell': editDeck('sell'); break;
      case 'upgrade': upgrade(+root.querySelector('#boxUpgrade').value); break;
      case 'reset': reset(Number(root.querySelector('#boxSeed').value)||0); break;
      case 'export': saveScene(); break;
    }
  });
  root.addEventListener('change',async e=>{
    if(e.target.id==='boxEditObject'){editSelection=e.target.value;editorMessage='';render();}
    if(e.target.id==='boxScale'){layout.fontSize=+e.target.value;render();}
    if(e.target.id==='boxScene' && e.target.files[0]){
      try{loadScene(JSON.parse((await e.target.files[0].text()).replace(/^\uFEFF/,'')));}
      catch(error){editorMessage='장면 불러오기 실패: '+error.message;editMode=true;render();}
    }
    if(e.target.id==='boxForced'){forced=e.target.value;log('[설정] 투척 결과 '+(forced||'시드 난수')+'.');}
    if(e.target.dataset.layerToggle) {layers[e.target.dataset.layerToggle]=e.target.checked;const group=root.querySelector('[data-layer="'+e.target.dataset.layerToggle+'"]');if(group)group.style.display=e.target.checked?'':'none';}
  });
  function showPreview(id) {
    if (state.phase!=='MOVE' || editMode) return;
    previewId=id;
    // Only redraw the SVG so keyboard focus and the hovered row stay stable.
    const board=root.querySelector('.box-board svg');
    if(board)board.outerHTML=renderBoard();
  }
  root.addEventListener('pointerover',e=>{const row=e.target.closest('[data-preview]');if(row&&!row.disabled)showPreview(+row.dataset.preview);});
  root.addEventListener('focusin',e=>{const row=e.target.closest('[data-preview]');if(row&&!row.disabled)showPreview(+row.dataset.preview);});
  root.addEventListener('keydown',e=>{
    if(e.target.matches('input,select,textarea,summary') || editMode)return;
    const token=e.target.closest('.box-piece');
    if(token && ['Enter',' '].includes(e.key)){e.preventDefault();move(+token.dataset.move);return;}
    if(e.key===' '&&state.phase==='SELECT'){e.preventDefault();toss();}
    if(e.key.toLowerCase()==='r')swap();
    if(/^[1-6]$/.test(e.key)&&state.hand[+e.key-1])select(state.hand[+e.key-1].uid);
  });
  window.YutoBoxing={mount(data){
    D=data;cfg={...D.boxing};sticks=Object.fromEntries(D.sticks.map(s=>[s.id,s]));
    nodes=Object.fromEntries(D.board.nodes.map(n=>[n.id,{...n}]));neighbors={};
    for(const route of Object.values(D.board.routes))for(let i=1;i<route.length;i++){
      const a=route[i-1]==='END'?'0':route[i-1], b=route[i]==='END'?'0':route[i];
      (neighbors[a]??=new Set()).add(b);(neighbors[b]??=new Set()).add(a);
    }
    reset(cfg.defaultSeed);
  }};
})();
