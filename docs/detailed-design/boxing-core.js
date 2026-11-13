/* Shared rules for play and forecast. Preview never consumes random numbers. */
(() => {
  'use strict';
  window.YutoCore = { create(D) {
    const C=D.boxing, R=D.rules, allRounds=D.run.acts.flatMap(a=>a.rounds.map(r=>({...r,act:a.act})));
    const stickById=Object.fromEntries(D.sticks.map(x=>[x.id,x]));
    const traitById=Object.fromEntries(D.deckTraits.map(x=>[x.id,x]));
    const pieceTraitById=Object.fromEntries(D.pieceTraits.map(x=>[x.id,x]));
    let s;
    const copy=value=>structuredClone(value);
    const row=(st=s)=>allRounds[st.round];
    const board=(st=s)=>row(st)?.type==='boss'?D.bigBoard:D.board;
    const item=(uid,st=s)=>st.collection.find(i=>i.uid===uid);
    const weight=(g,st=s)=>g.ids.reduce((n,id)=>n+st.pieces[id].weight,0);
    const boardPos=id=>D.board.nodes.find(n=>n.id===id)?.aliasOf||id;
    const samePos=(a,b)=>a!=null&&b!=null&&boardPos(a)===boardPos(b);
    const living=(st=s)=>st.groups.filter(g=>g.pos!=='END'&&g.ids.length);
    const name=g=>g.ids.map(id=>'ABCD'[id]).join('+');
    const carrier=(g,st=s)=>[...g.ids].sort((a,b)=>st.pieces[b].weight-st.pieces[a].weight||a-b)[0];
    const activeGroup=(st=s)=>living(st).find(g=>g.id===st.activeGroupId)||[...living(st)].sort((a,b)=>weight(b,st)-weight(a,st)||a.id-b.id)[0]||null;
    function setActive(gid){if(['DRAW','REVEAL','SELECT'].includes(s.phase)&&living().some(g=>g.id===gid)){s.activeGroupId=gid;touched();}}
    const sumTrait=(key,st=s)=>st.deckTraits.reduce((n,t)=>n+(traitById[t.id][key]||0)*t.level,0);
    const pieceFactor=(p,key)=>p.traits.reduce((n,id)=>n*(pieceTraitById[id]?.[key]||1),1);
    const currentPlan=(st=s)=>st.master?.plans[st.master.index]||null;
    const field=(st=s)=>D.roundTraits.find(t=>t.id===currentPlan(st)?.roundTraitId)||D.roundTraits[0];
    function stats(p,st=s) {
      return {maxHp:Math.max(1,Math.floor((p.baseHealth+p.weight*p.healthCoeff)*(p.healthScale??1)*p.healthFactor*pieceFactor(p,'healthX'))),
        attack:Math.max(1,Math.floor((p.baseAttack+p.weight*p.attackCoeff)*(p.attackScale??1)*p.attackFactor*pieceFactor(p,'attackX')*field(st).attackX))};
    }
    function sync(p,oldMax,st=s) {const max=stats(p,st).maxHp;p.hp=p.hp<=0?0:Math.min(max,Math.max(0,p.hp+max-oldMax));}
    function grow(p,amount,st=s,oldMax=stats(p,st).maxHp) {p.weight=Math.min(C.maxWeight,Math.max(0,p.weight+Math.floor(amount)));sync(p,oldMax,st);}
    function retune(p,changes,st=s) {const next={...p,...changes};sync(next,stats(p,st).maxHp,st);if(next.weight<=0)next.hp=0;if(Object.hasOwn(next,'dead')){next.dead=next.hp===0;if(next.dead)next.weight=0;}return next;}
    function rng(st) {st.rng=(Math.imul(st.rng,1664525)+1013904223)>>>0;return st.rng/4294967296;}
    function random() {return rng(s);}
    function shuffle(values) {const a=[...values];for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
    function log(message,st=s) {st.log.push({round:row(st)?.id||'menu',turn:st.turn,message});}
    function touched() {s.revision++;}
    function addItem(type) {const i={uid:++s.serial,type,level:0};s.collection.push(i);return i.uid;}
    const handSize=()=>Math.min(s.deck.length,s.trait?.id==='tightHand'?4:R.handSize);
    function drawTurn() {
      if(s.phase!=='DRAW')return;
      const before=s.hand.length;s.lastDraw=[];s.selected=[];
      while(s.hand.length<handSize()&&s.draw.length){const uid=s.draw.pop();s.hand.push(uid);s.lastDraw.push(uid);}
      s.phase='REVEAL';touched();log('드로우 '+s.lastDraw.length+'개 · 유지 손패 '+before+'개 · 손패 공개 대기.');
    }
    function revealHand() {if(s.phase!=='REVEAL')return;s.phase='SELECT';s.selected=[];touched();log('손패 '+s.hand.length+'개 공개 · 던질 윷 4개를 직접 고르세요.');}
    function interest(st=s) {return Math.min(D.economy.interestCap+sumTrait('interestCapPerLevel',st),Math.floor(st.coins/D.economy.interestPer));}
    function price(value) {return Math.max(1,value-sumTrait('discountPerLevel'));}
    function offerRisks() {
      const ids=s.round===0?['standard','safe','rush']:['standard','safe','shortcut','rush','fall','hunt','piggyback','feast','tightHand','allOrNothing'];
      const pool=D.riskChoices.filter(t=>ids.includes(t.id));
      let offers=shuffle(pool).slice(0,3);
      if(!offers.some(t=>t.risk===0))offers[0]=pool.find(t=>t.id==='standard');
      s.riskOffers=offers.map(t=>t.id);
    }
    function reset(seed) {
      s={version:3,lastFeedback:[],lastEnemyTurns:[],seed:seed>>>0,rng:seed>>>0,serial:0,revision:0,round:0,phase:'MENU',handFlow:1,lastDraw:[],practice:false,activeGroupId:null,lastRoll:null,lastTurn:null,turn:0,startedAt:Date.now(),
        collection:[],deck:[],capacity:R.startingDeckMax,deckTraits:[],charms:[],coins:D.economy.startCoins,
        templates:Array.from({length:R.piecesPerPlayer},(_,id)=>({id,level:0,baseWeight:C.pieceBaseWeight,baseHealth:C.pieceBaseHealth,baseAttack:C.pieceBaseAttack,
          healthCoeff:C.pieceHealthWeightCoeff,attackCoeff:C.pieceAttackWeightCoeff,moveSpeed:C.pieceMoveSpeed,healthScale:1,attackScale:1,traits:[]})),
        master:null,pieces:[],groups:[],guards:[],hand:[],draw:[],selected:[],pending:null,riskOffers:[],trait:null,target:0,score:0,total:0,tosses:0,swaps:0,
        shop:[],rerolls:0,reward:null,log:[],record:{maxGain:0,maxWeight:0,maxAttack:0,maxHp:0,maxHit:0,maxN:0,maxM:0,maxX:1,bosses:0}};
      log('윷토체스 · 업고, 곱하고, 돌파한다. 시작 덱을 선택하세요.');
    }
    function chooseDeck(id) {
      if(s.phase!=='MENU')return;
      const d=D.starterDecks.find(d=>d.id===id);if(!d)return;
      s.starter=id;s.coins=d.coins;s.collection=[];s.deck=[];
      for(const [type,count] of Object.entries(d.sticks))for(let i=0;i<count;i++)s.deck.push(addItem(type));
      s.deckTraits=[{id:d.trait,level:1}];s.target=row().target;s.phase='TRAIT';offerRisks();touched();log(d.name+' · '+traitById[d.trait].name+' 카드로 시작.');
    }
    function chooseRisk(id) {
      if(s.phase!=='TRAIT'||!s.riskOffers.includes(id))return;
      s.trait=D.riskChoices.find(t=>t.id===id);s.target=Math.round(row().target*s.trait.targetX);s.phase='PREP';touched();
      log(s.trait.name+' 선택 · 목표 '+s.target+' · 보스 HP/공격 위험도 '+risk(s));
    }
    const risk=st=>row(st).baseRisk+(st.trait?.risk||0);
    function bossUnits(st=s) {
      const placements=[...row(st).bosses],count=st.round===0?0:Math.min(row(st).extraBossPosts.length,(row(st).extraBosses||0)+(st.trait?.extraBosses||0));
      for(let i=0;i<count;i++)placements.push({role:'extra',id:row(st).extraBossKinds[i%row(st).extraBossKinds.length],post:row(st).extraBossPosts[i]});
      return placements.map((placement,index)=>{
        const b=D.guardians.find(b=>b.id===placement.id),r=risk(st),healthScale=(1+r*C.riskHealthStep)*(st.trait?.bossGimmick==='calm'?0.9:1),attackScale=(1+r*C.riskAttackStep)*(st.trait?.bossGimmick==='calm'?0.9:1);
        const g={id:'boss-'+index,kind:b.id,role:placement.role,unitClass:b.kind,gimmick:b.gimmick,pickGimmick:st.trait?.bossGimmick||'none',name:b.name,pos:placement.post,
          weight:Math.round(b.weight*row(st).bossScale),baseHealth:C.bossBaseHealth,baseAttack:C.bossBaseAttack,
          healthCoeff:C.bossHealthWeightCoeff,attackCoeff:C.bossAttackWeightCoeff,healthScale:1,attackScale:1,healthFactor:b.healthX*healthScale,attackFactor:b.attackX*attackScale,traits:[],hp:1,
          visionRange:R.guardianCombat.visionRange,targetPieceId:null,history:[],lastRoll:null};
        g.hp=stats(g).maxHp;return g;
      });
    }
    function startRound() {
      if(s.phase!=='PREP')return;
      if(s.deck.length<R.minDeckSize||s.deck.length>s.capacity){log('출전 윷은 '+R.minDeckSize+'~'+s.capacity+'개여야 합니다.');return;}
      s.phase='DRAW';s.lastDraw=[];s.activeGroupId=0;s.lastRoll=null;s.lastTurn=null;s.lastEnemyTurns=[];s.lastFeedback=[];s.turn=0;s.score=0;s.reward=null;s.pending=null;s.selected=[];
      const delta=s.deckTraits.reduce((n,t)=>n+(traitById[t.id].tossDelta||0),0);
      s.tosses=Math.max(1,R.tossesPerRound+delta+(s.charms.includes('lucky')?1:0)-(s.trait.id==='lastStand'?3:0));
      s.swaps=R.swapsPerRound;s.hand=[];s.draw=shuffle(s.deck);
      s.pieces=s.templates.map(t=>{const p={...copy(t),weight:t.baseWeight+sumTrait('initialWeight'),healthFactor:1,attackFactor:1,hp:1,dead:false,settled:false,effects:[],moveBonus:0};p.hp=stats(p).maxHp;return p;});
      // Reserve groups are drawn at start 0; null prevents a returning piece from carrying untravelled reserves into the finish.
      s.groups=s.pieces.map(p=>({id:p.id,ids:[p.id],pos:null,route:'outer',history:[]}));s.guards=bossUnits();s.master=makeMaster();
      touched();log(row().id+' 출전 · 수문장 2체 + 일반 보스 '+(s.guards.length-2)+'체 · 사용한 윷은 매 턴 덱으로 돌아가 셔플.');updateRecord(s);
    }
    function upgradeBonus(i) {return D.stickUpgrade.levels.filter(l=>l.level<=i.level).reduce((v,l)=>({n:v.n+(l.bonus.chips||0),m:v.m+(l.bonus.addMult||0),x:v.x*(l.bonus.xMult||1)}),{n:0,m:0,x:1});}
    function calculate(pending,st=s,p=null,size=1,finishCount=0) {
      let n=pending.hand.chips+finishCount*(R.finishChipsPerPiece+(st.charms.includes('tortoise')?100:0))*(st.trait?.id==='rush'?2:1);
      let m=pending.hand.mult+sumTrait('addMultPerLevel',st),x=1;
      const lines=[pending.hand.name+' N '+n+' / M '+m];
      pending.items.forEach((uid,index)=>{
        const i=item(uid,st),b=stickById[i.type],up=upgradeBonus(i);
        n+=up.n;m+=up.m;x*=up.x;
        const on=b.trigger==='always'||b.trigger===pending.faces[index];
        if(on){n+=b.chips;m+=b.addMult;x*=b.xMult;}
        lines.push(b.name+' '+(pending.faces[index]==='flat'?'배':'등')+(on?' 발동':' 미발동'));
      });
      for(const f of D.families){const count=pending.items.filter(uid=>stickById[item(uid,st).type].family===f.id).length;const tier=Object.keys(f.bonus).map(Number).filter(v=>v<=count).sort((a,b)=>b-a)[0];if(tier){const b=f.bonus[tier];n+=b.chips||0;m+=b.addMult||0;x*=b.xMult||1;}}
      if(pending.hand.id==='backdo')m+=4;
      if(st.charms.includes('magpie')&&pending.hand.id==='gae')m+=3;
      if(st.trait?.id==='feast')m+=2;
      if(st.trait?.id==='backdoFest'&&pending.hand.id==='backdo')n*=5;
      if(st.trait?.id==='allOrNothing'){if(['gae','geol'].includes(pending.hand.id))n=0;else if(pending.hand.id!=='backdo')x*=2;}
      x*=1+sumTrait('growthPerLevel',st);
      if(R.extraTossOn.includes(pending.hand.id))x*=1+sumTrait('bigHandXPerLevel',st);
      const support=R.scoring.stackSupportBonus+sumTrait('supportPerLevel',st)+(st.trait?.id==='piggyback'?0.25:0);
      const stackX=1+support*(size-1);x*=stackX*(p?pieceFactor(p,'growthX'):1);
      return {n,m,x,stackX,gain:Math.min(C.maxWeight,Math.floor(n*m*x)),lines};
    }
    function handFor(items,faces,st=s) {
      const flats=faces.filter(f=>f==='flat').length,back=flats===1&&stickById[item(items[faces.indexOf('flat')],st).type].marked;
      return D.hands.find(h=>back?h.id==='backdo':h.flats===flats&&!h.markedOnly);
    }
    function outcomes(items,st=s) {
      const rows=Object.fromEntries(D.hands.map(h=>[h.id,{hand:h,p:0,gain:0,min:Infinity,max:0}]));
      let min=Infinity,max=0,ev=0;
      for(let mask=0;mask<16;mask++){
        let prob=1;const faces=items.map((uid,i)=>{const b=stickById[item(uid,st).type],flat=!!(mask&(1<<i));prob*=flat?b.pFlat:1-b.pFlat;return flat?'flat':'back';});
        if(prob===0)continue;const hand=handFor(items,faces,st),value=calculate({items,faces,hand},st).gain,v=rows[hand.id];
        v.p+=prob;v.gain+=prob*value;v.min=Math.min(v.min,value);v.max=Math.max(v.max,value);min=Math.min(min,value);max=Math.max(max,value);ev+=prob*value;
      }
      return {rows:Object.values(rows),min,max,ev};
    }
    function select(uid) {if(s.phase!=='SELECT')return;if(s.selected.includes(uid))s.selected=s.selected.filter(v=>v!==uid);else if(s.hand.includes(uid)&&s.selected.length<R.sticksPerToss)s.selected.push(uid);touched();}
    function swap() {
      if(s.phase!=='SELECT'||s.swaps<=0||!s.selected.length)return;
      const out=[...s.selected];s.hand=s.hand.filter(uid=>!out.includes(uid));s.draw=shuffle([...s.draw,...out]);s.selected=[];s.swaps--;s.lastDraw=[];s.phase='DRAW';touched();log(out.length+'개 교체 반환·셔플 · 교체 드로우 대기.');
    }
    function toss(forced='') {
      if(s.phase!=='SELECT'||s.selected.length!==R.sticksPerToss||s.tosses<=0)return;
      const items=[...s.selected];s.lastFeedback=[];
      if(forced==='backdo'&&!items.some(uid=>stickById[item(uid).type].marked)){log('빽도 고정은 표시 윷이 필요합니다.');return;}
      let faces=items.map(uid=>random()<stickById[item(uid).type].pFlat?'flat':'back');
      if(forced){const h=D.hands.find(h=>h.id===forced);if(h){faces.fill('back');const order=items.map((_,i)=>i).sort((a,b)=>Number(!!stickById[item(items[a]).type].marked)-Number(!!stickById[item(items[b]).type].marked));if(forced==='backdo')faces[items.findIndex(uid=>stickById[item(uid).type].marked)]='flat';else order.slice(0,h.flats).forEach(i=>faces[i]='flat');}}
      const hand=handFor(items,faces);s.turn++;s.tosses--;s.pending={items,faces,hand,route:null};s.lastRoll={turn:s.turn,hand:hand.id,items:[...items],faces:[...faces]};s.selected=[];s.lastDraw=[];
      const active=activeGroup();
      const canBack=g=>g.pos!=null&&g.history.length>0;
      const fallback=hand.move<0&&!canBack(active||{pos:null})?[...living()].filter(canBack).sort((a,b)=>weight(b)-weight(a)||a.id-b.id)[0]:null;
      s.activeGroupId=(fallback||active)?.id??null;
      s.hand=s.hand.filter(uid=>!items.includes(uid));s.draw=shuffle([...s.draw,...items]);log('사용 윷 '+items.length+'개 덱 반환·셔플 · 남은 손패 '+s.hand.length+'개 유지.');
      const fall=s.trait.id==='fall'&&random()<0.1;
      if(!fall&&R.extraTossOn.includes(hand.id))s.tosses++;
      log((forced?'[고정] ':'')+hand.name+' · '+calculate(s.pending).lines.join(' → '));touched();
      if(fall){feedback(s,'윷가락',0,'낙 · 이번 윷 효과 무효');s.lastTurn={turn:s.turn,hand:'fall',group:'',n:0,m:0,x:1,gain:0,weightBefore:0,weightAfter:0,scoreGain:0,arrival:null,skipped:true};log('낙: 이번 결과 무효. 투척 소모, 성장 없음.');finishTurn();return;}
      if(hand.move<0&&!living().some(canBack)){feedback(s,'윷가락',0,'이동할 말이 없는 빽도');s.lastTurn={turn:s.turn,hand:hand.id,group:'',n:0,m:0,x:1,gain:0,weightBefore:0,weightAfter:0,scoreGain:0,arrival:null,skipped:true};log('움직일 말이 없는 빽도. 귀속 생략.');finishTurn();return;}
      s.phase='MOVE';
    }
    function routeOptions(g,st=s) {
      if(!g)return [];
      const current=['5','10'].includes(g.pos)?'outer':g.route,ids=[current],branch=g.pos!=null?board(st).branchOnStop[g.pos]:null;
      if(st.pending?.hand.move>=0&&branch&&st.trait.id!=='shortcut'&&!st.guards.some(b=>b.hp>0&&samePos(b.pos,g.pos)))ids.push(branch);
      const seen=new Set();
      return [...new Set(ids)].filter(id=>{const route=board(st).routes[id],index=g.pos==null?0:route.indexOf(g.pos);if(index<0)return false;const key=route.slice(index).join('>');if(seen.has(key))return false;seen.add(key);return true;}).map(id=>({id,name:id===branch?'지름길':'현재 길'}));
    }
    function plan(g,st=s) {
      const currentBoss=st.guards.find(b=>b.hp>0&&samePos(b.pos,g.pos));
      if(currentBoss)return [];
      const raw=st.pending.hand.move,main=st.pieces[carrier(g,st)],count=raw<0?-1:Math.max(1,raw+main.moveSpeed-1+(main.moveBonus||0)+field(st).speedBonus);
      if(count<0)return g.pos==null||!g.history.length?[]:[g.history.at(-1)||{pos:null,route:'outer'}];
      let pos=g.pos??'0',route=g.pos==null?'outer':g.route;
      const options=routeOptions(g,st);if(options.some(o=>o.id===st.pending.route))route=st.pending.route;else if(options.length)route=options[0].id;
      const path=board(st).routes[route],out=[];let i=path.indexOf(pos);
      for(let step=0;step<count;step++){i++;pos=path[i]||'END';out.push({pos,route});if(pos==='G'||pos==='END')break;}
      return out;
    }
    function movementForecast(g=activeGroup()) {
      if(!g||!['SELECT','MOVE'].includes(s.phase))return [];
      const hands=s.pending?[s.pending.hand]:D.hands;
      return hands.flatMap(hand=>{
        const canBack=unit=>unit.pos!=null&&unit.history.length>0;
        const mover=hand.move<0&&!canBack(g)?[...living()].filter(canBack).sort((a,b)=>weight(b)-weight(a)||a.id-b.id)[0]:g;
        if(!mover)return [{hand,route:g.route,path:[],arrival:g.pos,origin:g.pos,groupId:g.id,groupName:name(g),skipped:true}];
        const mock={...s,pending:{hand,route:null}};
        return routeOptions(mover,mock).map(option=>{
          const st={...mock,pending:{hand,route:option.id}},path=plan(mover,st);
          return {hand,route:option.id,routeName:option.name,path,arrival:path.length?path.at(-1).pos:mover.pos,origin:mover.pos,groupId:mover.id,groupName:name(mover),skipped:false};
        });
      });
    }
    function updateRecord(st) {for(const p of st.pieces){const a=stats(p,st);st.record.maxWeight=Math.max(st.record.maxWeight,p.weight);st.record.maxHp=Math.max(st.record.maxHp,a.maxHp);st.record.maxAttack=Math.max(st.record.maxAttack,a.attack);}}
    function applyDamage(g,damage,st) {
      let remaining=damage;
      // Support bodies share the hit; only actual HP reaches zero, not score weight.
      const ids=[...g.ids].sort((a,b)=>st.pieces[a].weight-st.pieces[b].weight||a-b);
      for(const id of ids){const p=st.pieces[id],hit=Math.min(p.hp,remaining);p.hp-=hit;remaining-=hit;if(p.hp===0){p.dead=true;p.weight=0;log('말 '+'ABCD'[id]+' 사망 · 이번 라운드 미정산 weight 소멸.',st);}if(remaining<=0)break;}
      g.ids=g.ids.filter(id=>!st.pieces[id].dead);st.groups=st.groups.filter(g=>g.ids.length);return g.ids.length>0;
    }
    function makeMaster() {
      const candidates=board().nodes.map(n=>n.id).filter(id=>!['0','J','C','G','END'].includes(id)&&!s.guards.some(b=>b.pos===id));
      const plans=[];
      for(let i=0;i<D.gameMaster.planCount;i++){
        const count=row().tileCount;
        const positions=i===0&&s.round===0?['5','7']:shuffle(candidates).slice(0,count);
        const tiles=positions.map((pos,index)=>({pos,type:s.round===0?(index===0?'fortune':'well'):(i===0&&index===0?'fortune':row().tileKinds[Math.floor(random()*row().tileKinds.length)])}));
        const pool=D.roundTraits.filter(t=>row().fieldTraits.includes(t.id));
        const roundTraitId=s.round===0?'calm':pool[Math.floor(random()*pool.length)].id;
        plans.push({tiles,roundTraitId});
      }
      return {index:0,cycle:D.gameMaster.cycleTurns,plans};
    }
    function removeDepleted(st) {
      for(const p of st.pieces)if(!p.dead&&!p.settled&&(p.hp<=0||p.weight<=0)){p.hp=0;p.weight=0;p.dead=true;log('말 '+'ABCD'[p.id]+' 사망 · 미정산 weight 소멸.',st);}
      for(const g of st.groups)g.ids=g.ids.filter(id=>!st.pieces[id].dead);
      st.groups=st.groups.filter(g=>g.ids.length);
    }
    function feedback(st,source,delta,label,metric='live') {st.lastFeedback??=[];st.lastFeedback.push({source,delta,label,metric});}
    function normalTile(pos,st=s) {
      if(pos==null||['0','J','C','G','END'].includes(pos)||currentPlan(st)?.tiles.some(t=>samePos(t.pos,pos))||st.guards.some(b=>b.hp>0&&samePos(b.pos,pos)))return null;
      return {weight:D.normalTiles.lossNodes.includes(pos)?D.normalTiles.loss:D.normalTiles.gain};
    }
    function applyTile(g,st,events) {
      const tile=currentPlan(st)?.tiles.find(t=>samePos(t.pos,g.pos));if(!g.ids.length)return;
      if(!tile){
        const effect=normalTile(g.pos,st);if(!effect)return;
        const p=st.pieces[carrier(g,st)],before=p.weight;grow(p,effect.weight,st);removeDepleted(st);
        feedback(st,'일반 칸',p.weight-before,'말 '+'ABCD'[p.id]+' · '+g.pos+'번');
        events.push({type:'score',title:'일반 칸 '+(effect.weight>=0?'+':'')+effect.weight,message:'말 '+'ABCD'[p.id]+' 보유점수 '+before+' → '+p.weight});return;
      }
      const effect=D.specialTiles.find(t=>t.id===tile.type),p=st.pieces[carrier(g,st)],before=p.weight;
      if(effect.weight)grow(p,effect.weight,st);
      if(effect.heal)p.hp=Math.min(stats(p,st).maxHp,p.hp+effect.heal);
      if(effect.damage)p.hp=Math.max(0,p.hp-effect.damage);
      if(effect.speed)p.moveBonus=Math.min(3,(p.moveBonus||0)+effect.speed);
      events.push({type:'master',title:'특수칸 · '+effect.name,message:effect.effect});log('마스터 특수칸 '+effect.name+' → 말 '+'ABCD'[p.id]+' · '+effect.effect,st);removeDepleted(st);feedback(st,'특수칸',p.weight-before,effect.name+' · '+effect.effect);
    }
    function masterPhase(st,events) {
      if(!st.master)return;
      const trait=field(st);
      if(trait.weightDrain){
        const before=st.pieces.filter(p=>!p.settled).reduce((n,p)=>n+p.weight,0);
        for(const p of st.pieces)if(!p.dead&&!p.settled)grow(p,-trait.weightDrain,st);
        for(const b of st.guards)if(b.hp>0){grow(b,-trait.weightDrain,st);if(b.weight===0)b.hp=0;}
        removeDepleted(st);feedback(st,'판 전체',st.pieces.filter(p=>!p.settled).reduce((n,p)=>n+p.weight,0)-before,trait.name);events.push({type:'master',title:'판 전체 · '+trait.name,message:'생존 말·보스 weight -'+trait.weightDrain+' · 정산한 말 제외'});log(trait.name+' 턴말 weight -'+trait.weightDrain,st);
      }
      if(st.turn>0&&st.turn%st.master.cycle===0){
        st.master.index=(st.master.index+1)%st.master.plans.length;
        if(row(st).pulseDamage){
          const before=st.pieces.reduce((n,p)=>n+p.weight,0);
          for(const g of living(st).filter(g=>g.pos!=null))for(const id of g.ids)st.pieces[id].hp=Math.max(0,st.pieces[id].hp-row(st).pulseDamage);
          removeDepleted(st);feedback(st,'빅 기믹',st.pieces.reduce((n,p)=>n+p.weight,0)-before,'갱신 충격 · HP -'+row(st).pulseDamage);
          events.push({type:'master',title:'빅 라운드 · 갱신 충격',message:'출전 말마다 HP -'+row(st).pulseDamage});log('빅 라운드 갱신 충격 · 출전 말마다 HP -'+row(st).pulseDamage,st);
        }
        const next=currentPlan(st),active=field(st);events.push({type:'master',title:'게임 마스터 갱신',message:'특수칸 '+next.tiles.length+'개 재배치 · '+active.effect});log('게임 마스터: 특수칸 '+next.tiles.length+'개 / '+active.name+' → '+active.effect,st);
      }
    }

    function fight(g,boss,st,events,bossFirst=false) {
      const playerHp=g.ids.reduce((n,id)=>n+st.pieces[id].hp,0),playerMaxHp=g.ids.reduce((n,id)=>n+stats(st.pieces[id],st).maxHp,0);
      const bossBefore=boss.hp,bossMaxHp=stats(boss,st).maxHp,beforeWeight=weight(g,st);
      let attack=0,hit=0,counter=0;
      function playerStrike() {
        if(!g.ids.length||boss.hp<=0)return;
        attack=g.ids.reduce((n,id)=>n+stats(st.pieces[id],st).attack,0);
        if(boss.gimmick==='supportResonance')attack=Math.max(1,Math.floor(attack*(g.ids.length>=2?1.25:C.shortcutSoloDamageX)));
        if(boss.gimmick==='gateArmor')attack=Math.max(1,Math.floor(attack*C.gateDamageX));
        if(boss.gimmick==='chipShield')attack=Math.max(1,attack-10);
        hit=Math.min(boss.hp,attack);boss.hp-=hit;st.record.maxHit=Math.max(st.record.maxHit,hit);
        events.push({type:'strike',side:'player',enemy:bossFirst,title:name(g)+(bossFirst?' 반격':' 선공'),message:'공격 '+attack+' → '+boss.name+' HP '+bossBefore+' → '+boss.hp});
      }
      function bossStrike() {
        if(boss.hp<=0||!g.ids.length)return;
        counter=stats(boss,st).attack;
        if((['lastStand','gateArmor'].includes(boss.gimmick)||boss.pickGimmick==='lastStand')&&boss.hp<=stats(boss,st).maxHp/2)counter=Math.floor(counter*1.5);
        if(boss.pickGimmick==='loneHunter'&&g.ids.length===1)counter=Math.floor(counter*1.25);
        applyDamage(g,counter,st);
        events.push({type:'strike',side:'boss',enemy:bossFirst,title:boss.name+(bossFirst?' 선공':' 반격'),message:'피해 '+counter+' → 말 HP '+playerHp+' → '+g.ids.reduce((n,id)=>n+st.pieces[id].hp,0)});
      }
      if(bossFirst){bossStrike();playerStrike();}else{playerStrike();bossStrike();}
      if(boss.hp===0&&g.ids.length){
        st.tosses+=R.captureExtraToss;st.record.bosses++;
        const main=st.pieces[carrier(g,st)],multiplier=C.bossVictoryX+risk(st)*C.bossVictoryRiskStep+(st.trait.id==='hunt'?0.5:0);
        const bonus=Math.floor(main.weight*(multiplier-1));grow(main,bonus,st);
        events.push({type:'burst',enemy:bossFirst,title:'보스 돌파 ×'+multiplier.toFixed(2),message:'주말 weight +'+bonus+' · 투척 +'+R.captureExtraToss});
        log(boss.name+' 처치 · weight ×'+multiplier.toFixed(2)+' · 추가 투척.',st);
      }
      const result={bossId:boss.id,bossName:boss.name,groupName:name(g),gimmick:boss.gimmick,pickGimmick:boss.pickGimmick,attack,hit,counter,playerMaxHp,bossMaxHp,playerHpBefore:playerHp,playerHpAfter:g.ids.reduce((n,id)=>n+st.pieces[id].hp,0),bossHpBefore:bossBefore,bossHpAfter:boss.hp,win:boss.hp===0,dead:!g.ids.length,bossFirst};
      if(weight(g,st)!==beforeWeight)feedback(st,'전투',weight(g,st)-beforeWeight,boss.name+' · '+(result.win?'처치 증폭':'쓰러진 말의 보유점수 소멸'));
      log((bossFirst?'보스 턴 ':'')+boss.name+' 전투 · 말 HP '+result.playerHpAfter+' / 보스 HP '+boss.hp+'.',st);
      return result;
    }
    function boardPath(from,to,st=s,blocked=new Set()) {
      from=boardPos(from);to=boardPos(to);
      const edges=new Map();
      for(const route of Object.values(board(st).routes))for(let i=1;i<route.length;i++){
        const a=boardPos(route[i-1]),b=boardPos(route[i]);if(a==='END'||b==='END'||a===b)continue;
        if(!edges.has(a))edges.set(a,new Set());if(!edges.has(b))edges.set(b,new Set());edges.get(a).add(b);edges.get(b).add(a);
      }
      const queue=[[from]],seen=new Set([from]);
      for(let i=0;i<queue.length;i++){
        const path=queue[i],last=path.at(-1);if(last===to)return path;
        for(const n of edges.get(last)||[])if(!seen.has(n)&&!blocked.has(n)){seen.add(n);queue.push([...path,n]);}
      }
      return null;
    }
    function enemyPhase(st,events) {
      const turns=[];
      for(const boss of st.guards.filter(b=>b.role==='extra'&&b.hp>0)){
        const report={bossId:boss.id,name:boss.name,origin:boss.pos,arrival:boss.pos,path:[],hand:null,battle:null,message:''};
        const targets=()=>living(st).filter(g=>g.pos!=null);
        let target=targets().find(g=>g.ids.includes(boss.targetPieceId));
        if(!target){
          boss.targetPieceId=null;
          target=targets().sort((a,b)=>a.id-b.id).find(g=>{const p=boardPath(boss.pos,g.pos,st);return p&&p.length-1<=boss.visionRange;});
          if(target){boss.targetPieceId=target.ids[0];report.message='말 '+name(target)+' 최초 발견. ';}
        }
        if(!target){report.message='시야 '+boss.visionRange+'칸 내 대상 없음 · 대기';turns.push(report);log(boss.name+' · '+report.message,st);events.push({type:'enemy',title:boss.name+' 대기',message:report.message});continue;}
        // Projected state owns its RNG: hovering a forecast cannot consume the live turn's roll.
        const faces=Array.from({length:4},()=>rng(st)<R.guardianCombat.pFlat),flats=faces.filter(Boolean).length;
        const hand=D.hands.find(h=>flats===1&&faces[0]?h.id==='backdo':h.flats===flats&&!h.markedOnly);
        report.hand=hand.id;boss.lastRoll={hand:hand.id,faces:faces.map(f=>f?'flat':'back')};
        const blocked=new Set(st.guards.filter(b=>b!==boss&&b.hp>0).map(b=>boardPos(b.pos)));
        if(hand.move<0){
          const previous=boss.history.at(-1);if(previous&&!blocked.has(boardPos(previous))){boss.history.pop();boss.pos=previous;report.path.push(previous);}
        }else{
          const path=boardPath(boss.pos,target.pos,st,blocked);
          for(const pos of (path||[]).slice(1,hand.move+1)){
            boss.history.push(boss.pos);boss.pos=pos;report.path.push(pos);
            if(targets().some(g=>samePos(g.pos,boss.pos)))break;
          }
        }
        report.arrival=boss.pos;report.message+='말 '+'ABCD'[boss.targetPieceId]+' 추적 · '+hand.name+' · '+report.origin+' → '+boss.pos;
        events.push({type:'enemy',title:boss.name+' · '+hand.name,message:report.message});log(boss.name+' · '+report.message,st);
        const contact=targets().find(g=>samePos(g.pos,boss.pos));
        if(contact){const groupName=name(contact);report.battle=fight(contact,boss,st,events,true);report.battle.groupName=groupName;}
        turns.push(report);
      }
      st.lastEnemyTurns=turns;updateRecord(st);return turns;
    }

    function preview(gid,routeId=null) {
      if(s.phase!=='MOVE')return null;
      const source=s.groups.find(g=>g.id===gid);if(!source||source.pos==='END'||(s.pending.hand.move<0&&(source.pos==null||!source.history.length)))return null;
      const next=copy(s),g=next.groups.find(g=>g.id===gid);
      if(routeId&&routeOptions(g,next).some(o=>o.id===routeId))next.pending.route=routeId;
      const path=plan(g,next),events=[],beforeWeight=weight(g,next),beforeScore=next.score;
      for(const step of path){if(next.pending.hand.move<0)g.history.pop();else g.history.push({pos:g.pos,route:g.route});g.pos=step.pos;g.route=step.route;}
      const arriving=g.pos,partner=next.groups.find(x=>x!==g&&samePos(x.pos,g.pos)&&g.pos!=null&&g.pos!=='END');
      if(partner){
        const combined=[...g.ids,...partner.ids],main=[...combined].sort((a,b)=>next.pieces[b].weight-next.pieces[a].weight||a-b)[0];
        const previous=g.ids.includes(main)?g.ids.length:partner.ids.length,newSupports=combined.length-previous;
        const support=R.scoring.stackSupportBonus+sumTrait('supportPerLevel',next)+(next.trait.id==='piggyback'?0.25:0);
        const bonus=Math.floor(next.pieces[main].weight*support*newSupports);
        g.ids=combined.sort((a,b)=>a-b);next.groups=next.groups.filter(x=>x!==partner);grow(next.pieces[main],bonus,next);feedback(next,'업기',bonus,'지원 말 '+newSupports+'개');
        events.push({type:'burst',title:'업기 증폭',message:'낮은 weight 지원 '+newSupports+'개 → 주말 '+'ABCD'[main]+' weight +'+bonus});
        log(name(g)+' 업기 · 주말 '+'ABCD'[main]+' +'+bonus+' weight.',next);
      }
      let main=next.pieces[carrier(g,next)];
      const previousMax=stats(main,next).maxHp;main.attackFactor=next.pending.hand.attackX;main.healthFactor=next.pending.hand.healthX;
      const value=calculate(next.pending,next,main,g.ids.length),rollBefore=main.weight;grow(main,value.gain,next,previousMax);feedback(next,'윷가락',main.weight-rollBefore,next.pending.hand.name+' · N × M × X');
      main.effects.push({turn:next.turn,hand:next.pending.hand.id,items:[...next.pending.items],n:value.n,m:value.m,x:value.x});
      next.record.maxGain=Math.max(next.record.maxGain,value.gain);next.record.maxN=Math.max(next.record.maxN,value.n);next.record.maxM=Math.max(next.record.maxM,value.m);next.record.maxX=Math.max(next.record.maxX,value.x);
      events.push({type:'burst',title:'N × M → weight',message:value.n+' × '+value.m+' × '+value.x.toFixed(2)+' = +'+value.gain});
      log('주말 '+'ABCD'[main.id]+' 성장 '+value.n+' × '+value.m+' × '+value.x.toFixed(2)+' = +'+value.gain+' weight.',next);
      removeDepleted(next);applyTile(g,next,events);
      if(g.ids.length)main=next.pieces[carrier(g,next)];
      const boss=next.guards.find(b=>b.hp>0&&samePos(b.pos,g.pos));let battle=null;
      if(boss&&g.ids.length)battle=fight(g,boss,next,events);
      if(g.ids.length&&(g.pos==='G'||g.pos==='END')&&!next.guards.some(b=>b.hp>0&&b.pos==='G')){
        main=next.pieces[carrier(g,next)];
        const base=calculate(next.pending,next,main,g.ids.length),finished=calculate(next.pending,next,main,g.ids.length,g.ids.length);
        const finishBefore=main.weight;grow(main,finished.gain-base.gain,next);feedback(next,'완주',main.weight-finishBefore,'완주 추가 성장');g.pos='END';
        const sum=g.ids.reduce((n,id)=>n+(next.pieces[id].settled?0:next.pieces[id].weight),0);
        for(const id of g.ids)next.pieces[id].settled=true;next.score+=sum;
        feedback(next,'완주 정산',sum,name(g)+' 완주 확정','settled');
        events.push({type:'settle',title:'완주 정산',message:'+'+sum+'점 · 현재 '+next.score+' / 목표 '+next.target});log(name(g)+' 완주 +'+sum+'점. 중복 정산 없음.',next);
      }
      const enemyTurns=next.score<next.target?enemyPhase(next,events):[];
      if(next.score<next.target)masterPhase(next,events);
      const turnEnd={playerHp:g.ids.reduce((n,id)=>n+next.pieces[id].hp,0),playerMaxHp:g.ids.reduce((n,id)=>n+stats(next.pieces[id],next).maxHp,0),bossHp:battle?next.guards.find(b=>b.id===battle.bossId).hp:null,bossMaxHp:battle?stats(next.guards.find(b=>b.id===battle.bossId),next).maxHp:null,field:field(next).name};
      updateRecord(next);
      return {enemyTurns,turnEnd,revision:s.revision,next,groupId:gid,origin:source.pos,arrival:arriving,path,value,battle,events,weightBefore:beforeWeight,weightAfter:g.ids.length?weight(g,next):0,scoreGain:next.score-beforeScore,groupName:name(source),carrier:main?.id};
    }
    function finishTurn(masterApplied=false) {
      if(!masterApplied&&s.score<s.target){enemyPhase(s,[]);masterPhase(s,[]);}
      s.selected=[];s.pending=null;
      if(s.score>=s.target){
        const base=Math.round(row().baseReward*s.trait.rewardX),remaining=s.tosses*D.economy.perRemainingToss,i=interest(),overflow=s.score-s.target,bonus=Math.floor(overflow/C.overflowStep)*C.overflowCoins;
        s.reward={base,remaining,interest:i,overflow,bonus,sum:base+remaining+i+bonus};s.phase='REWARD';log('목표 달성 · 초과 '+overflow+' · 보상 수령 대기.');
      }else if(s.tosses<=0||living().length===0){s.phase='LOSE';log('런 종료. 미완주 weight는 점수로 정산하지 않습니다.');}
      else{s.phase='DRAW';s.lastDraw=[];log('다음 턴 · 사용 윷은 덱에 반환됨. 부족한 손패를 드로우하세요.');}
      touched();
    }
    function commitMove(projection) {if(s.phase!=='MOVE'||!projection||projection.revision!==s.revision)return false;const p=projection;s=p.next;s.lastTurn={turn:s.turn,hand:s.pending.hand.id,group:p.groupName,n:p.value.n,m:p.value.m,x:p.value.x,gain:p.value.gain,weightBefore:p.weightBefore,weightAfter:p.weightAfter,scoreGain:p.scoreGain,arrival:p.arrival,steps:p.path.length,stationaryFight:!p.path.length&&!!p.battle,events:p.events.map(e=>({type:e.type,title:e.title,message:e.message}))};finishTurn(true);return true;}
    function rollShop() {
      const choose=pool=>pool[Math.floor(random()*pool.length)];
      const third=choose(['pieceTrait','charm']);
      s.shop=[{kind:'stick',ref:choose(D.shopPool.sticks)},{kind:'deckTrait',ref:choose(D.shopPool.deckTraits)},
        {kind:third,ref:choose(third==='pieceTrait'?D.shopPool.pieceTraits:D.shopPool.charms)}].map((o,index)=>({...o,index,sold:false}));s.rerolls=0;
    }
    function claimReward() {
      if(s.phase!=='REWARD')return;
      s.coins+=s.reward.sum;s.total+=s.score;s.hand=[];s.draw=[];s.selected=[];s.lastDraw=[];
      s.phase=s.round===allRounds.length-1?'WIN':'CHOICE';
      log('라운드 결과 보상 '+s.reward.sum+'냥 1회 수령.');touched();
    }
    function enterShop() {if(s.phase!=='CHOICE')return;s.phase='SHOP';rollShop();log('상점 입장 · 현재 잔액으로 구매와 성장을 선택하세요.');touched();}
    function skipShop() {if(s.phase!=='CHOICE')return;const bonus=interest();s.coins+=bonus;log('상점 건너뛰기 · 추가 이자 +'+bonus+'냥 1회 지급.');advanceRound();}
    function advanceRound() {
      s.round++;s.practiceFixed=false;s.phase='TRAIT';s.trait=null;s.score=0;s.target=row().target;s.groups=[];s.pieces=[];s.guards=[];s.master=null;s.hand=[];s.draw=[];s.lastDraw=[];s.lastRoll=null;s.lastTurn=null;s.activeGroupId=null;
      offerRisks();touched();
    }
    function nextRound() {if(s.phase==='SHOP')advanceRound();}
    function product(o) {if(o.kind==='stick')return stickById[o.ref];if(o.kind==='deckTrait')return traitById[o.ref];if(o.kind==='pieceTrait')return pieceTraitById[o.ref];return D.charms.find(c=>c.id===o.ref);}
    function buy(index,targetPiece=0,replaceUid=0) {
      if(s.phase!=='SHOP')return;const o=s.shop[index];if(!o||o.sold)return;const data=product(o),cost=price(data.price);if(s.coins<cost){log('엽전이 부족합니다.');return;}
      if(o.kind==='deckTrait'&&(s.deckTraits.length>=R.deckTraitSlots||s.deckTraits.some(t=>t.id===o.ref))){log('덱 특성 슬롯/중복을 확인하세요.');return;}
      if(o.kind==='pieceTrait'&&(s.templates[targetPiece].traits.length>=R.pieceTraitSlots||s.templates[targetPiece].traits.includes(o.ref))){log('말 특성 슬롯/중복을 확인하세요.');return;}
      if(o.kind==='charm'&&(s.charms.length>=R.charmSlots||s.charms.includes(o.ref))){log('부적 슬롯/중복을 확인하세요.');return;}
      if(o.kind==='stick'&&s.collection.length>=32&&!replaceUid){log('보유 윷은 최대 32개입니다. 교체할 윷을 선택하세요.');return;}
      if(o.kind==='stick'){
        const old=item(replaceUid),active=old&&s.deck.includes(old.uid);if(old){s.collection=s.collection.filter(i=>i!==old);s.deck=s.deck.filter(uid=>uid!==old.uid);}
        const uid=addItem(o.ref);if(active)s.deck.push(uid);
      }
      if(o.kind==='deckTrait')s.deckTraits.push({id:o.ref,level:1});
      if(o.kind==='pieceTrait')s.templates[targetPiece].traits.push(o.ref);
      if(o.kind==='charm')s.charms.push(o.ref);
      s.coins-=cost;o.sold=true;log(data.name+' 구매 -'+cost+'냥'+(o.kind==='stick'?' · 다음 출전 편집에서 선택.':''));touched();
    }
    function reroll() {if(s.phase!=='SHOP')return;const cost=D.economy.rerollBase+s.rerolls*D.economy.rerollStep;if(s.coins<cost)return;const n=s.rerolls+1;s.coins-=cost;rollShop();s.rerolls=n;log('상점 재진열 -'+cost+'냥.');touched();}
    function toggleDeck(uid) {if(!['PREP','SHOP'].includes(s.phase))return;if(s.deck.includes(uid))s.deck=s.deck.filter(id=>id!==uid);else if(item(uid)&&s.deck.length<s.capacity)s.deck.push(uid);else log('출전 슬롯이 가득 찼습니다.');touched();}
    function removeItem(uid,sell=false) {if(!['SHOP','PREP'].includes(s.phase)||s.collection.length<=R.minDeckSize)return;const old=item(uid);if(!old)return;const cost=sell?0:price(D.economy.removeStickCost);if(s.coins<cost)return;s.coins+=sell?Math.floor(stickById[old.type].price*D.economy.sellRatio):-cost;s.collection=s.collection.filter(i=>i!==old);s.deck=s.deck.filter(id=>id!==uid);log(stickById[old.type].name+(sell?' 판매.':' 삭제.'));touched();}
    function upgradeStick(uid) {if(s.phase!=='SHOP')return;const i=item(uid),l=i&&D.stickUpgrade.levels.find(l=>l.level===i.level+1);if(!l||s.coins<price(l.cost))return;s.coins-=price(l.cost);if(random()<l.success){i.level++;log(stickById[i.type].name+' 강화 +'+i.level);}else {if(l.onFail!=='keep')i.level=Math.max(0,i.level-1);log('강화 실패 · 현재 +'+i.level+' (박싱은 파괴 대신 하락).');}touched();}
    function capacity() {const cost=price(C.deckCapacityCost);if(s.phase!=='SHOP'||s.capacity>=C.deckCapacityMax||s.coins<cost)return;s.coins-=cost;s.capacity++;log('출전 윷 상한 '+s.capacity+'개로 확장.');touched();}
    function upgradeDeckTrait(index) {const t=s.deckTraits[index],cost=t&&price(C.traitUpgradeCost*t.level);if(s.phase!=='SHOP'||!t||t.level>=3||s.coins<cost)return;s.coins-=cost;t.level++;log(traitById[t.id].name+' 특성 Lv.'+t.level);touched();}
    function removeDeckTrait(index) {if(!['PREP','SHOP'].includes(s.phase))return;const t=s.deckTraits[index];if(!t)return;s.deckTraits.splice(index,1);log(traitById[t.id].name+' 특성 카드 삭제.');touched();}
    function upgradePiece(id) {const p=s.templates[id],cost=p&&price(C.pieceUpgradeCost*(p.level+1));if(s.phase!=='SHOP'||!p||p.level>=6||s.coins<cost)return;s.coins-=cost;p.level++;p.baseWeight+=C.pieceUpgradeWeight;p.baseHealth+=C.pieceUpgradeHealth;p.baseAttack+=C.pieceUpgradeAttack;p.healthCoeff+=0.01;p.attackCoeff+=0.01;if(p.level%3===0)p.moveSpeed++;log('말 '+'ABCD'[id]+' 강화 Lv.'+p.level+' · 다음 라운드 적용.');touched();}
    function removePieceTrait(id,index) {if(s.phase!=='SHOP'||!s.templates[id]?.traits[index])return;s.templates[id].traits.splice(index,1);log('말 '+'ABCD'[id]+' 특성 삭제.');touched();}
    function scenario(kind,practice=false) {
      const [category,value,ref]=kind.split(':');
      reset(C.defaultSeed);chooseDeck(category==='starter'?value:'woodcutter');
      if(category==='round')s.round=Number(value);
      else if(category==='boss')s.round=1;
      else if(category==='field')s.round=3;
      const riskId=category==='risk'?value:'standard';s.riskOffers=[riskId];chooseRisk(riskId);startRound();
      s.practice=practice;s.practiceScene=kind;s.practiceFixed=practice&&kind==='stack';s.lastEnemyTurns=[];s.lastFeedback=[];
      const g=s.groups[0];
      const place=(unit,pos,route='outer')=>{unit.pos=pos;unit.route=route;unit.history=board().routes[route].slice(0,board().routes[route].indexOf(pos)).map(p=>({pos:p==='0'?null:p,route}));};
      if(kind==='finish'){place(g,'J');grow(s.pieces[0],Math.max(s.target+C.overflowStep,Math.ceil(stats(s.guards.find(b=>b.role==='gate')).maxHp/(C.pieceAttackWeightCoeff*C.gateDamageX))*2));}
      if(kind==='combat'){place(g,'a2','diagA');grow(s.pieces[0],100);}
      if(kind==='stack'){place(g,'4');place(s.groups[1],'5');grow(s.pieces[1],400);}
      if(kind==='failure')s.tosses=1;
      if(category==='tile'){
        place(g,'4');s.pieces[0].hp=Math.max(1,s.pieces[0].hp-30);
        s.master.plans=s.master.plans.map(p=>({tiles:[{pos:'5',type:value}],roundTraitId:'calm'}));
      }
      if(category==='field'){
        place(g,'4');s.master.plans=s.master.plans.map(p=>({...p,roundTraitId:value}));
      }
      if(category==='hand'){
        place(g,'4');
        if(value==='backdo'){const marked=s.draw.find(uid=>stickById[item(uid).type].marked);if(marked){s.draw=s.draw.filter(uid=>uid!==marked);s.draw.push(marked);}}
      }
      if(category==='normal')place(g,value==='loss'?'3':'1');
      if(category==='boss'){
        const boss=s.guards.find(b=>b.role==='extra');
        const type=D.guardians.find(b=>b.id===value&&b.kind==='boss');
        if(type){const old=D.guardians.find(b=>b.id===boss.kind);boss.healthFactor*=type.healthX/old.healthX;boss.attackFactor*=type.attackX/old.attackX;boss.weight=Math.round(type.weight*row().bossScale);boss.kind=type.id;boss.name=type.name;boss.gimmick=type.gimmick;boss.hp=stats(boss).maxHp;}
        s.master.plans=s.master.plans.map(()=>({tiles:[],roundTraitId:'calm'}));
        place(g,value==='outside'||value==='track'?'1':'2');
        boss.pos=value==='outside'||value==='track'?'10':'4';boss.history=['3'];
        if(value==='detect'){place(g,'1');boss.pos='5';boss.history=[];}
        boss.targetPieceId=value==='track'?0:null;
        const p=s.pieces[0];p.healthScale=6;p.hp=stats(p).maxHp;
      }
      if(['reward','choice','shop'].includes(kind)||category==='product'){
        s.score=s.target+C.overflowStep;finishTurn(true);if(kind!=='reward')claimReward();if(kind==='shop'||category==='product')enterShop();
        s.coins=100;
        if(category==='product')s.shop[0]={kind:value,ref,index:0,sold:false};
      }
      log('[장면] '+kind+' · 플레이어 고정 결과는 체험 UI에 표시. 일반 보스 윷은 난수.');touched();
    }
    function replaceState(next) {s=next;s.lastDraw??=[];s.handFlow=1;touched();}
    function reconcile() {if(['DRAW','REVEAL','SELECT','MOVE'].includes(s.phase)&&(s.score>=s.target||!living().length||(s.phase!=='MOVE'&&s.tosses<=0)))finishTurn(true);}
    reset(C.defaultSeed);
    return {get state(){return s;},rounds:allRounds,stickById,traitById,pieceTraitById,row,board,boardPath,normalTile,item,weight,boardPos,samePos,living,activeGroup,setActive,routeOptions,movementForecast,carrier,name,stats,field,currentPlan,sumTrait,calculate,outcomes,interest,price,bossUnits,risk,
      reset,chooseDeck,chooseRisk,startRound,drawTurn,revealHand,handSize,select,swap,toss,plan,preview,commitMove,claimReward,enterShop,skipShop,nextRound,product,buy,reroll,toggleDeck,removeItem,upgradeStick,capacity,upgradeDeckTrait,removeDeckTrait,upgradePiece,removePieceTrait,scenario,replaceState,reconcile,log,touched,sync,retune,updateRecord};
  }};
})();
