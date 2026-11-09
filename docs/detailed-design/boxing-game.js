/* Browser shell and scene editor. Rules/forecasts are shared in boxing-core.js. */
(() => {
  'use strict';
  const root=document.getElementById('boxingGame');
  const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num=v=>Math.floor(v||0).toLocaleString('ko-KR');
  const fix=v=>Number(v).toFixed(2).replace(/0+$/,'').replace(/\.$/,'');
  const labelPos=p=>p==null?'출발 대기':p==='END'?'완주':p==='G'?'완주 관문':p==='J'?'귀환 합류':p==='0'?'출발':p+'번';
  const button=(text,action,value='',off=false,css='')=>'<button type="button" class="'+css+'" data-action="'+action+'" data-value="'+esc(value)+'"'+(off?' disabled':'')+'>'+text+'</button>';
  let D,core,nodes,edit=false,selection='frame:ui',message='',forced='',hover=null,drag=null,battle=null,timer=null;
  const layout={scoreWidth:180,intelWidth:195,fontSize:14,accent:'#285d8f'};
  const layers={frame:true,pieces:true,guardians:true,threat:true,specials:true};
  const phaseNames={MENU:'메뉴·덱 특성',TRAIT:'리스크 선택',PREP:'출전 윷 편집',SELECT:'윷 선택',MOVE:'갈림길·이동',REWARD:'보상',SHOP:'상점·성장',WIN:'런 완주',LOSE:'런 종료'};
  const s=()=>core.state;
  const locked=()=>edit||!!battle;
  const inventoryOptions=(empty=false)=> (empty?'<option value="0">교체 없이 보관</option>':'')+s().collection.map(i=>'<option value="'+i.uid+'">'+esc(core.stickById[i.type].name)+' #'+i.uid+' +'+i.level+'</option>').join('');
  const pieceSelect=(id='boxShopPiece')=>'<label>대상 말 <select id="'+id+'">'+s().templates.map(t=>'<option value="'+t.id+'">말 '+'ABCD'[t.id]+' Lv.'+t.level+'</option>').join('')+'</select></label>';
  function summary() {
    const st=s(),live=core.living().reduce((n,g)=>n+core.weight(g),0);
    return '<div class="box-metrics simple"><div><small>보유점수 · 말 합계</small><b>'+num(live)+'</b><span>완주 확정 '+num(st.score)+'</span></div><div><small>남은 필요 점수</small><b>'+num(Math.max(0,st.target-st.score))+'</b><span>목표 '+num(st.target)+'</span></div><div><small>재화 / 이번 예상 이자</small><b>'+st.coins+' <em>+'+core.interest()+'</em></b><span>다음 기본 목표 '+(core.rounds[st.round+1]?num(core.rounds[st.round+1].target):'최종 라운드')+'</span></div></div><details class="box-metric-details"><summary>완주 가정 점수 보기</summary><p>정산+현재 말 '+num(st.score+live)+' / 전원 완주 가정 부족 '+num(Math.max(0,st.target-st.score-live))+'. 승리 판정은 실제 완주 정산으로 합니다.</p></details>';
  }
  function masterPanel() {
    const st=s();if(!st.master)return '';
    const plan=core.currentPlan(),active=core.field(),next=st.master.plans[(st.master.index+1)%st.master.plans.length],future=D.roundTraits.find(t=>t.id===next.roundTraitId);
    return '<div class="box-master"><b>게임 마스터 · '+esc(active.name)+'</b><span>'+esc(active.effect)+'</span><small>다음 갱신 '+(st.master.cycle-st.turn%st.master.cycle)+'턴 뒤 · 다음 판 전체 특성 '+esc(future.name)+'</small><details><summary>특수칸과 다음 갱신 예고</summary><p>현재 '+plan.tiles.map(t=>esc(labelPos(t.pos))+' '+esc(D.specialTiles.find(e=>e.id===t.type).name)).join(' / ')+'</p><p>다음 '+next.tiles.map(t=>esc(labelPos(t.pos))+' '+esc(D.specialTiles.find(e=>e.id===t.type).name)).join(' / ')+'</p><p>'+esc(future.effect)+'</p></details></div>';
  }
  function forecast(p) {
    if(!p)return '<p class="box-muted">말을 선택하면 도착·업기·전투를 예측합니다.</p>';
    const b=p.battle,effects=p.events.filter(e=>e.type==='master');
    return '<div class="box-forecast"><h4>'+esc(p.groupName)+' → '+esc(labelPos(p.arrival))+'</h4>'+
      (b?'<div class="box-forecast-versus"><div><b>말 '+esc(p.groupName)+'</b><span>HP '+num(b.playerHpBefore)+' → '+num(b.playerHpAfter)+'</span><strong>선공 '+num(b.attack)+'</strong></div><b>VS</b><div><b>'+esc(b.bossName)+'</b><span>HP '+num(b.bossHpBefore)+' → '+num(b.bossHpAfter)+'</span><strong>반격 '+num(b.counter)+'</strong></div></div><p>'+ (b.dead?'아군 사망':b.win?'보스 처치·증폭':'양쪽 생존·현재 칸에서 다음 교전')+'</p>':'<p>도착 칸 교전 없음. 경유·인접 칸은 공격하지 않습니다.</p>')+
      (effects.length?'<p class="box-forecast-effects">'+effects.map(e=>esc(e.title+' · '+e.message)).join('<br>')+'</p>':'')+
      '<p>턴말 아군 HP '+num(p.turnEnd.playerHp)+(b?' / 보스 HP '+num(p.turnEnd.bossHp):'')+(p.turnEnd.playerHp===0?' · 턴말 사망 위험':'')+'</p><details><summary>상세 weight·정산 예측</summary><p class="box-equation"><span>'+num(p.value.n)+'</span> × <span>'+num(p.value.m)+'</span> × '+fix(p.value.x)+' = +'+num(p.value.gain)+' W</p><p>묶음 weight '+num(p.weightBefore)+' → '+num(p.weightAfter)+' · 완주 정산 +'+num(p.scoreGain)+'</p></details><small>투척 후 전투는 추가 숨은 난수 없이 이 결과로 확정합니다.</small></div>';
  }
  function roster() {
    const st=s(),active=core.activeGroup();
    const card=g=>{
      const hp=g.ids.reduce((n,id)=>n+st.pieces[id].hp,0),max=g.ids.reduce((n,id)=>n+core.stats(st.pieces[id]).maxHp,0);
      const atk=g.ids.reduce((n,id)=>n+core.stats(st.pieces[id]).attack,0),p=st.pieces[core.carrier(g)];
      return '<b>말 '+esc(core.name(g))+'</b><span>'+esc(labelPos(g.pos))+'</span><strong class="box-weight-number">'+num(core.weight(g))+' <small>점</small></strong><span class="box-mini-hp"><i style="width:'+Math.min(100,hp/max*100)+'%"></i></span><span>HP '+num(hp)+' / '+num(max)+'</span><small>공격 '+num(atk)+' · 이동속도 '+(p.moveSpeed+(p.moveBonus||0)+core.field().speedBonus)+'</small>';
    };
    return '<span class="box-eyebrow">ACTIVE PIECE</span><h4>이번에 움직일 말</h4>'+(active?'<div class="box-active-piece">'+card(active)+'</div>':'<p>진행할 말이 없습니다.</p>')+'<p class="box-muted">던지면 이 말이 바로 이동합니다.<br>보유점수는 완주할 때 확정됩니다.</p><details data-box-detail="pieces"><summary>던지기 전 다른 말 선택</summary><div class="box-roster">'+core.living().map(g=>'<button type="button" data-action="active" data-value="'+g.id+'" aria-pressed="'+(g.id===active?.id)+'"'+(locked()||st.phase!=='SELECT'?' disabled':'')+'>'+card(g)+'</button>').join('')+'</div></details>'+st.pieces.filter(p=>p.dead).map(p=>'<p class="box-dead">말 '+'ABCD'[p.id]+' 사망</p>').join('');
  }
  function board() {
    const st=s(),xy=id=>{const n=nodes[nodes[id]?.aliasOf||id];return n?[70+n.x*80,70+n.y*80]:[0,0];};
    let base='',enemy='',units='',threat='',preview='',specials='';
    for(const [id,route] of Object.entries(D.board.drawPaths))base+='<polyline points="'+route.map(p=>xy(p).join(',')).join(' ')+'" class="box-route '+(id==='diagA'||id==='diagB'?'diagonal':'')+'"/>';
    for(const n of Object.values(nodes).filter(n=>!n.aliasOf)){
      const [x,y]=xy(n.id);
      base+='<circle data-edit-kind="node" data-edit-id="'+esc(n.id)+'" cx="'+x+'" cy="'+y+'" r="'+(n.tag?17:11)+'" class="box-node"/><text x="'+x+'" y="'+(y+30)+'" class="box-node-label">'+esc(n.id==='G'?'완주 관문':n.id==='0'?'출발·귀환':n.id==='END'?'완주':n.id)+'</text>';
    }
    for(const tile of core.currentPlan()?.tiles||[]){const [x,y]=xy(tile.pos),t=D.specialTiles.find(t=>t.id===tile.type);specials+='<g transform="translate('+x+','+y+')" class="box-special" data-edit-kind="tile" data-edit-id="'+tile.pos+'"><title>'+esc(t.name+' · '+t.effect)+'</title><rect x="-16" y="-16" width="32" height="32" rx="7"/><text y="4">'+esc(t.symbol)+'</text></g>';}
    for(const g of st.guards){const [x,y]=xy(g.pos);if(g.hp>0)threat+='<circle cx="'+x+'" cy="'+y+'" r="27" class="box-danger"/>';
      enemy+='<g transform="translate('+x+','+y+')" data-edit-kind="boss" data-edit-id="'+g.id+'" class="box-guard '+(g.hp===0?'fallen':'')+'"><title>'+esc(g.name)+' · HP '+num(g.hp)+' · W '+num(g.weight)+'</title><rect x="-18" y="-18" width="36" height="36" rx="3"/><text y="5">'+(g.role==='gate'?'門':'鬼')+'</text><text y="-26" class="box-guard-hp">'+num(g.hp)+'</text></g>';
    }
    const counts={};
    for(const g of st.groups.filter(g=>g.pos!=null&&g.pos!=='END')){
      const [x,y]=xy(g.pos),key=core.boardPos(g.pos),offset=(counts[key]||0)*22,occupied=st.guards.some(b=>b.hp>0&&core.samePos(b.pos,g.pos));counts[key]=(counts[key]||0)+1;
      units+='<g transform="translate('+(x+offset-(occupied?70:0))+','+y+')" class="box-piece '+(g.id===core.activeGroup()?.id?'active':'')+'" role="button" tabindex="0" data-action="active" data-value="'+g.id+'" data-edit-kind="unit" data-edit-id="'+core.carrier(g)+'" aria-label="말 '+esc(core.name(g))+'"><circle r="18"/><text y="5">'+esc(core.name(g))+'</text><text y="-25" class="box-piece-weight">W '+num(core.weight(g))+'</text></g>';
    }
    if(hover!=null&&st.phase==='MOVE'&&!edit){const g=st.groups.find(g=>g.id===hover);if(g)for(const step of battle?.projection.path||core.plan(g)){if(step.pos==null)continue;const [x,y]=xy(step.pos);preview+='<circle cx="'+x+'" cy="'+y+'" r="22" class="box-preview"/>';}}
    const layer=(id,body)=>'<g data-layer="'+id+'"'+(!layers[id]?' style="display:none"':'')+'>'+body+'</g>';
    return '<svg viewBox="0 0 540 710" role="img" aria-label="정사각형 윷판 아래에 연결한 완주 관문과 도착 칸. 파란 말, 수문장 둘과 선택에 따른 일반 보스·특수칸."><g data-layer="board">'+base+'</g>'+layer('specials',specials)+layer('threat',threat)+'<g>'+preview+'</g>'+layer('guardians',enemy)+layer('pieces',units)+layer('frame','<path d="M15 48V15H48 M492 15H525V48 M525 662V695H492 M48 695H15V662" class="box-frame-line"/><text x="270" y="30" class="box-frame-title">YUTOCHESS · LAND / FORECAST / STRIKE</text>')+'</svg>';
  }
  function gimmickText(g){return [({supportResonance:'업힌 말 선공 ×1.25',lastStand:'HP 절반 이하 반격 ×1.5',chipShield:'선공 피해 10 경감',heavyStrike:'강한 공격 계수'}[g.gimmick]||''),({lastStand:'픽: 절반 이하 반격 강화',loneHunter:'픽: 단독 말 상대 반격 ×1.25',calm:'픽: HP·공격 완화'}[g.pickGimmick]||'')].filter(Boolean).join(' / ');}
  function intel() {
    const st=s(),g=core.activeGroup(),early=st.round===0&&st.turn<=3;
    const bosses=st.guards.map(b=>'<div class="box-enemy"><b>'+esc(b.name)+' / '+esc(labelPos(b.pos))+'</b><span>HP '+num(b.hp)+' / '+num(core.stats(b).maxHp)+'</span><span>공격 '+num(core.stats(b).attack)+'</span><small>'+esc(gimmickText(b))+'</small></div>').join('');
    return '<span class="box-eyebrow">LAND & STRIKE</span><h4>멈춘 칸에서만 전투</h4><p>경유하면 통과합니다.<br>관문 G에서는 반드시 멈춥니다.</p>'+(early?'<details data-box-detail="bosses"><summary>수문장 HP·공격·기믹</summary>'+bosses+'</details>':bosses)+(st.pending&&core.routeOptions(g).length<=1?'<div id="boxForecast">'+forecast(g?core.preview(g.id):null)+'</div>':'');
  }
  function turnResult() {
    const st=s(),r=st.pending?{hand:st.pending.hand.id}:st.lastTurn||st.lastRoll;
    if(!r)return '';
    const h=D.hands.find(h=>h.id===r.hand),p=battle?.projection;
    const value=p?.value||(st.pending?null:st.lastTurn),hasValue=value&&value.n>0;
    const moving=!!battle&&!battle.projection.battle;
    return '<div class="box-roll-result" aria-live="polite"><div class="box-roll-name"><small>'+(r.hand==='fall'?'결과 무효':'확정된 윷 결과')+'</small><b>'+esc(h?.name||'낙')+'</b><strong>'+(h?(h.move<0?'뒤로 1칸':h.move+'칸'):'이동 없음')+'</strong><small>'+(moving?'이동 중…':!st.pending&&st.lastTurn?.skipped?'이번 턴 성장 없음':st.pending?'이동속도 보너스·관문 정지는 이동 경로에 반영':'이동 완료 · '+esc(st.lastTurn?.scoreGain>0?'완주':labelPos(st.lastTurn?.arrival)))+'</small></div>'+(hasValue?'<div class="box-score-equation"><div><small>기본점수</small><b>'+num(value.n)+'</b></div><span>×</span><div><small>배율</small><b>'+num(value.m)+'</b></div><span>×</span><div><small>추가배율</small><b>'+fix(value.x)+'</b></div><strong>= +'+num(value.gain)+'<small>말의 보유점수</small></strong></div>':'<p>보유점수는 말에 쌓이고, 완주해야 확정됩니다.</p>')+(st.lastTurn&&!st.pending&&!st.lastTurn.skipped?'<p>말 '+esc(st.lastTurn.group)+' 보유점수 '+num(st.lastTurn.weightBefore)+' → <b>'+num(st.lastTurn.weightAfter)+'</b> · 이번 완주 확정 <b>+'+num(st.lastTurn.scoreGain)+'</b></p>':'')+'</div>';
  }
  function handPanel() {
    const st=s();if(!['SELECT','MOVE'].includes(st.phase))return '';
    const g=core.activeGroup(),options=st.phase==='MOVE'&&g?core.routeOptions(g):[];
    if(st.phase==='MOVE')return turnResult()+(battle?'':options.length>1?'<div class="box-junction"><h4>갈림길 · 어느 길로 갈까요?</h4><div class="box-offers">'+options.map(o=>{const p=core.preview(g.id,o.id);return '<article>'+button(esc(o.name)+' → '+esc(labelPos(p.arrival)),'route',o.id,false,'box-primary')+'<p>'+p.path.length+'칸 이동'+(p.battle?' · 선공 '+num(p.battle.hit)+' / 반격 '+num(p.battle.counter):' · 전투 없음')+'</p>'+forecast(p)+'</article>';}).join('')+'</div></div>':button('확정 결과로 이동 계속','resume','','','box-primary'));
    const odds=st.selected.length===4?core.outcomes(st.selected):null;
    return turnResult()+'<div class="box-hand-area"><div class="box-hand-heading"><div><h4>말 '+esc(g?core.name(g):'—')+' · 윷 '+st.selected.length+'/4개 준비</h4><small>기본 4개가 준비됩니다. 바꾸기는 선택입니다.</small></div>'+button('윷 던지기 → 바로 이동','toss','',locked()||st.selected.length!==4||!g,'box-primary')+'</div><p class="box-prob">'+(odds?odds.rows.map(v=>v.hand.name+' '+(v.p*100).toFixed(0)+'%').join(' · '):'윷을 4개 선택하세요.')+'</p><details class="box-hand-edit" data-box-detail="hand"><summary>던질 윷 바꾸기 · 점수 범위 보기</summary><p>파란 윷 4개를 던집니다. 배/등 확률과 점수 재료를 조절하세요.</p>'+button('선택 윷 교체 · 남은 '+st.swaps,'swap','',locked()||!st.selected.length||st.swaps<=0)+'<div class="box-hand">'+st.hand.map((uid,i)=>{
      const v=core.item(uid),b=core.stickById[v.type],picked=st.selected.includes(uid);
      return '<button type="button" class="box-card '+(picked?'chosen':'')+'" data-action="card" data-value="'+uid+'" aria-pressed="'+picked+'"'+(locked()?' disabled':'')+'><small>'+(i+1)+' · '+esc(b.family)+'</small><div class="box-stick">'+(b.marked?'×':'')+'</div><b>'+esc(b.name)+' +'+v.level+'</b><span>배 '+Math.round(b.pFlat*100)+'% · 기본점수 +'+b.chips+'</span><small>'+esc(b.effect)+'</small></button>';
    }).join('')+'</div>'+(odds?'<p>기본 보유점수 증가 <b>'+num(odds.min)+'~'+num(odds.max)+'</b> · 업기·말 특성·보스 증폭 전</p>':'')+'</details></div>';
  }
  function traitCards() {
    return s().deckTraits.map((t,index)=>'<article class="box-trait-card"><small>DECK TRAIT / Lv.'+t.level+'</small><b>'+esc(core.traitById[t.id].name)+'</b><p>'+esc(core.traitById[t.id].effect)+'</p>'+(['SHOP','PREP'].includes(s().phase)?button('삭제','remove-trait',index,locked())+(s().phase==='SHOP'?button('강화 '+core.price(D.boxing.traitUpgradeCost*t.level)+'냥','upgrade-trait',index,locked()||t.level>=3):''):'')+'</article>').join('');
  }
  function stage() {
    const st=s(),phase=st.phase;
    if(phase==='MENU')return '<div class="box-quickstart"><h4>작은 말을 업으면, 숫자가 커집니다.</h4>'+button('첫 3턴 체험 · 도 → 걸 → 모','practice','','','box-primary')+' '+button('바로 시작 · 기본 덱','quickstart')+'<p>기본 덱·정석·8개 윷으로 바로 출전합니다. 체험만 첫 3턴을 고정하며 실제 런은 시드 난수로 진행합니다.</p></div><details><summary>다른 시작 덱 선택</summary><h4>덱의 방향을 고르세요.</h4><p>첫 출전 윷은 최대 8개입니다. 덱 효과는 편집 가능한 특성 카드로 시작합니다.</p><div class="box-offers">'+D.starterDecks.map(d=>'<button type="button" data-action="deck" data-value="'+d.id+'"><b>'+esc(d.name)+' · '+d.coins+'냥</b><span>'+esc(Object.entries(d.sticks).map(([id,n])=>core.stickById[id].name+' '+n).join(' / '))+'</span><strong>'+esc(core.traitById[d.trait].name)+'</strong><small>'+esc(core.traitById[d.trait].effect)+'</small></button>').join('')+'</div><p class="box-muted">3막 9라운드 · 약 30분 목표. 실제 소요 시간과 균형은 확인 전입니다.</p></details>';
    if(phase==='TRAIT')return '<h4>'+core.row().id+' · 리스크와 보상을 고르세요.</h4><p>선택지는 런 시드로 뽑혔습니다. 위험도가 높아지면 보스 HP와 공격력이 함께 증가합니다.</p><div class="box-offers">'+st.riskOffers.map(id=>{const t=D.riskChoices.find(t=>t.id===id),mock={...st,trait:t},bosses=core.bossUnits(mock);return '<button type="button" data-action="risk" data-value="'+id+'"><b>'+esc(t.name)+' / 위험 '+(core.row().baseRisk+t.risk)+'</b><span>'+esc(t.effect)+'</span><strong>목표 '+num(core.row().target*t.targetX)+' · 보상 ×'+t.rewardX+' · 보스 '+bosses.length+'체</strong><small>'+bosses.map(b=>b.name+' HP '+num(core.stats(b).maxHp)+' / 공격 '+num(core.stats(b).attack)+' / '+gimmickText(b)).join('<br>')+'</small></button>';}).join('')+'</div>';
    if(phase==='PREP')return '<h4>라운드 직전 · 출전 윷 편집</h4><p>선택 '+st.deck.length+'/'+st.capacity+'개 · 최소 '+D.rules.minDeckSize+'개. 상점에서 산 윷은 보유함에 있습니다. 출전시킬 윷을 고르세요.</p><div class="box-loadout">'+st.collection.map(i=>button(esc(core.stickById[i.type].name)+' +'+i.level+' #'+i.uid,'loadout',i.uid,locked(),st.deck.includes(i.uid)?'box-selected-card':'')).join('')+'</div><details><summary>덱 특성과 말 원형 자세히</summary><div class="box-traits">'+traitCards()+'</div><p>말 원형: '+st.templates.map(t=>'ABCD'[t.id]+' 시작 W '+num(t.baseWeight+core.sumTrait('initialWeight'))+' / 기본 HP '+num(t.baseHealth)+' / 기본 공격 '+num(t.baseAttack)).join(' · ')+'</p></details>'+button('이 구성으로 '+core.row().id+' 출전','start','',locked()||st.deck.length<D.rules.minDeckSize||st.deck.length>st.capacity,'box-primary');
    if(phase==='REWARD'){const r=st.reward;return '<h4>목표 돌파 · 보상을 받으세요.</h4><dl class="box-rewards">'+[['기본',r.base],['남은 투척',r.remaining],['이번 이자',r.interest],['초과 '+num(r.overflow)+'점',r.bonus],['받을 합계',r.sum]].map(([n,v])=>'<dt>'+n+'</dt><dd>'+v+'냥</dd>').join('')+'</dl>'+button(st.round===core.rounds.length-1?'보상 받기 → 런 결과':'보상 받기 → 상점','reward','','','box-primary');}
    if(phase==='SHOP')return shopPanel();
    if(phase==='WIN'||phase==='LOSE'){
      const r=st.record;return '<div class="box-run-memory"><small>YUTOCHESS / REMEMBER THIS BUILD</small><h4>'+(phase==='WIN'?'윷토체스 · 3막 돌파':'윷토체스 · 다음에는 더 크게')+'</h4><p>완주 정산 '+num(st.total)+' · 이번 라운드 '+num(st.score)+'/'+num(st.target)+' · 보스 '+r.bosses+'체</p><div class="box-memory-grid"><div>최고 증가량<b>'+num(r.maxGain)+' W</b></div><div>N × M × X<b>'+num(r.maxN)+' × '+num(r.maxM)+' × '+fix(r.maxX)+'</b><small>각 항목의 개별 최대치</small></div><div>최대 전투 피해<b>'+num(r.maxHit)+'</b></div><div>최대 HP / 공격<b>'+num(r.maxHp)+' / '+num(r.maxAttack)+'</b></div></div><div class="box-traits">'+traitCards()+'</div><p>시드 '+st.seed+' · 가장 크게 터진 조합을 다음 런에서 다시 만들어 보세요.</p>'+button('같은 시드로 새 런','reset','','','box-primary')+' '+button('빌드·사건 기록 저장','save')+'</div>';
    }
    return '';
  }
  function shopPanel() {
    const st=s(),target=0,t=st.templates[target];
    return '<h4>상점 · 한 가지를 키워보세요.</h4><p>상품은 이번 상점에 들어올 때 뽑았습니다. 남긴 돈은 다음 이자가 됩니다.</p>'+pieceSelect()+
      '<div class="box-offers">'+st.shop.map(o=>{const d=core.product(o);return '<article class="box-shop-card"><small>'+esc({stick:'윷가락',deckTrait:'덱 특성',pieceTrait:'말 특성',charm:'부적'}[o.kind])+'</small><b>'+esc(d.name)+'</b><p>'+esc(d.effect)+'</p>'+button(o.sold?'구매 완료':core.price(d.price)+'냥 구매','buy',o.index,locked()||o.sold)+'</article>';}).join('')+'</div><div class="box-simple-growth">'+button('선택한 말 강화','upgrade-target','',locked()||t.level>=6||st.coins<core.price(D.boxing.pieceUpgradeCost*(t.level+1)))+'<span>비용 '+core.price(D.boxing.pieceUpgradeCost*(t.level+1))+'냥부터 · 다음 라운드 적용</span></div>'+button('다음 리스크 선택 → 출전 윷 편집','next','',locked(),'box-primary')+
      '<details class="box-advanced-shop"><summary>상세 성장·덱 편집·재진열</summary>'+button('상품 다시 뽑기 '+(D.economy.rerollBase+st.rerolls*D.economy.rerollStep)+'냥','reroll','',locked())+' '+button('출전 상한 +1 / '+core.price(D.boxing.deckCapacityCost)+'냥','capacity','',locked()||st.capacity>=D.boxing.deckCapacityMax)+
      '<label>윷 구매 시 삭제·교체할 보유 윷<select id="boxReplace">'+inventoryOptions(true)+'</select></label><div class="box-shop-services"><h4>보유 윷 편집</h4><select id="boxOwned">'+inventoryOptions()+'</select>'+button('강화 시도','upgrade-stick','',locked())+' '+button('삭제','delete-stick','',locked())+' '+button('판매','sell-stick','',locked())+'<p id="boxUpgradeInfo"></p><p class="box-muted">확률 강화는 유지/하락까지 적용합니다. 파괴는 후속 범위입니다.</p></div><h4>덱 특성 카드 '+st.deckTraits.length+'/'+D.rules.deckTraitSlots+'</h4><div class="box-traits">'+traitCards()+'</div><h4>말 원형·특성 편집</h4><div class="box-offers">'+st.templates.map(t=>'<article class="box-shop-card"><b>말 '+'ABCD'[t.id]+' Lv.'+t.level+'</b><span>시작 W '+t.baseWeight+' / 기본 HP '+t.baseHealth+' / 공격 '+t.baseAttack+' / 속도 '+t.moveSpeed+'</span><small>weight 계수 HP '+fix(t.healthCoeff)+' · 공격 '+fix(t.attackCoeff)+'</small>'+button('강화 '+core.price(D.boxing.pieceUpgradeCost*(t.level+1))+'냥','upgrade-piece',t.id,locked()||t.level>=6)+t.traits.map((id,index)=>'<p>'+esc(core.pieceTraitById[id].name)+' '+button('특성 삭제','remove-piece-trait',t.id+':'+index,locked())+'</p>').join('')+'</article>').join('')+'</div></details>';
  }
  function machine() {
    return '<details class="box-tools" data-box-detail="machine"><summary>박싱 머신 · 레이어 / 고정 장면 / 저장</summary><div class="box-tool-grid"><fieldset><legend>레이어 표시</legend>'+Object.entries({frame:'UI 프레임',pieces:'말',guardians:'보스',threat:'보스 칸',specials:'특수칸'}).map(([id,name])=>'<label><input type="checkbox" data-layer-toggle="'+id+'"'+(layers[id]?' checked':'')+'> '+name+'</label>').join('')+'</fieldset><label>투척 결과<select id="boxForced"><option value="">시드 난수</option>'+D.hands.map(h=>'<option value="'+h.id+'"'+(forced===h.id?' selected':'')+'>'+esc(h.name)+' 고정</option>').join('')+'</select></label><div>별도 새 런의 확인 장면<br>'+['combat','stack','finish','failure'].map((id,i)=>button(['보스 예측·전투','작은 말 업기','완주·초과 보상','투척 소진'][i],'scenario',id,locked())).join(' ')+'</div>'+button('장면·빌드 저장','save','',!!battle)+'<label>장면 불러오기<input type="file" id="boxScene" accept=".json,application/json"'+(battle?' disabled':'')+'></label></div><p>시드·손패·확률·재화·다음 목표는 공개합니다. 리스크 선택지·손패·상품은 난수로 뽑고, 투척 후 예측과 실제 전투는 같은 계산을 사용합니다.</p></details>';
  }
  function hpBox(value,max) {
    const percent=Math.min(100,Math.max(0,value/Math.max(1,max)*100));
    return '<div class="box-hp-box"><div><b>HP '+num(value)+'</b><small>/ '+num(max)+'</small></div><div class="box-hp-track" role="meter" aria-label="남은 HP" aria-valuemin="0" aria-valuemax="'+Math.max(1,max)+'" aria-valuenow="'+value+'"><i style="width:'+percent+'%"></i></div></div>';
  }
  function animationPanel() {
    if(!battle?.projection.battle)return '';
    const p=battle.projection,b=p.battle,done=battle.done,event=p.events[battle.step],actor=done?'':event?.side;
    const hitStep=p.events.findIndex(e=>e.type==='strike'&&e.side==='player'),counterStep=p.events.findIndex(e=>e.type==='strike'&&e.side==='boss');
    const hpPlayer=done?p.turnEnd.playerHp:counterStep>=0&&battle.step>=counterStep?b.playerHpAfter:b.playerHpBefore;
    const hpBoss=done?p.turnEnd.bossHp:hitStep>=0&&battle.step>=hitStep?b.bossHpAfter:b.bossHpBefore;
    const fighter=(side,title,hp,max)=>'<div class="box-fighter '+side+' '+(actor===side?'attacking':'')+' '+(actor&&actor!==side?'hit':'')+'"><strong>'+esc(title)+'</strong>'+hpBox(hp,Math.max(max,hp))+'<div class="box-avatar"><i class="box-avatar-head"></i><i class="box-avatar-body"></i><i class="box-glove left"></i><i class="box-glove right"></i>'+(actor&&actor!==side?'<b class="box-damage">−'+num(actor==='player'?b.hit:b.counter)+'</b>':'')+'</div><small>'+ (side==='player'?'선공 피해 '+num(b.hit):'생존 시 반격 '+num(b.counter))+'</small></div>';
    return '<div class="box-battle-scrim"><section class="box-battle-panel" role="dialog" aria-modal="true" aria-label="HP 전투 결과"><small>'+(done?'RESULT · 확인할 때까지 유지':'BOXING · '+(battle.step+1)+' / '+p.events.length)+'</small><h4>'+(done?p.turnEnd.playerHp===0?'아군 쓰러짐':p.turnEnd.bossHp===0?'수문장 돌파!':'양쪽 생존 · 다음 턴 재교전':esc(event?.title||'전투'))+'</h4><div class="box-battle-actors">'+fighter('player','말 '+p.groupName,hpPlayer,done?(p.turnEnd.playerMaxHp||b.playerMaxHp):b.playerMaxHp)+'<b>VS</b>'+fighter('boss',b.bossName,hpBoss,done?p.turnEnd.bossMaxHp:b.bossMaxHp)+'</div><p class="box-burst-number" aria-live="polite">'+(done?'보유점수 '+num(p.weightBefore)+' → '+num(p.weightAfter)+' · 완주 +'+num(p.scoreGain):esc(event?.message||''))+'</p><p class="box-combat-prediction">확정 전투: 아군 HP '+num(b.playerHpBefore)+' → '+num(b.playerHpAfter)+' / 보스 HP '+num(b.bossHpBefore)+' → '+num(b.bossHpAfter)+'</p><ol class="box-battle-timeline">'+p.events.map((e,i)=>'<li class="'+(done||i<=battle.step?'active':'')+'">'+esc(e.title)+'</li>').join('')+'</ol><div class="box-battle-actions">'+(done?button('결과 확인 · 계속','close-battle','','','box-primary'):button('연출 생략 → 결과 보기','skip-battle'))+'</div></section></div>';
  }
  function quickRun() {
    if(s().phase!=='MENU')core.reset(s().seed);
    core.chooseDeck('woodcutter');core.chooseRisk('standard');core.startRound();forced='';hover=null;
  }
  function tossAndMove() {
    if(locked())return;
    core.toss(s().practice&&s().turn<3?D.onboarding.firstThreeHands[s().turn]:forced);hover=null;
    resolveRoll();
  }
  function resolveRoll() {
    const g=core.activeGroup();
    if(s().phase==='MOVE'&&g&&core.routeOptions(g).length<=1){beginMove(g.id);return;}
    render();
  }
  function beginMove(id,routeId=null) {
    if(locked())return;const p=core.preview(id,routeId);if(!p)return;
    battle={projection:p,step:0,done:false};hover=id;
    if(!p.battle){render();timer=setTimeout(finishAnimation,matchMedia('(prefers-reduced-motion: reduce)').matches?0:D.boxing.moveAnimationMs);}
    else animateStep();
  }
  function animateStep() {
    if(!battle)return;
    if(battle.step>=battle.projection.events.length||matchMedia('(prefers-reduced-motion: reduce)').matches){finishAnimation();return;}
    render();timer=setTimeout(()=>{if(!battle)return;battle.step++;animateStep();},D.boxing.animationStepMs);
  }
  function finishAnimation() {
    if(timer!=null)clearTimeout(timer);timer=null;if(!battle||battle.done)return;
    const p=battle.projection;const applied=core.commitMove(p);hover=null;
    if(applied&&p.battle){battle.done=true;battle.step=p.events.length;}else battle=null;
    render();
  }
  function editorPanel() {
    const st=s(),opts=[['frame:ui','UI 프레임'],['rules:round','라운드 자원·위험도'],...(st.master?[['master:stage','마스터·판 전체 특성'],...core.currentPlan().tiles.map(t=>['tile:'+t.pos,'특수칸 '+labelPos(t.pos)])]:[]),...Object.keys(nodes).filter(id=>!nodes[id].aliasOf).map(id=>['node:'+id,'보드 '+labelPos(id)]),
      ...st.pieces.filter(p=>!p.settled).map(p=>['unit:'+p.id,'말 '+'ABCD'[p.id]+(p.dead?' (사망)':'')]),...st.guards.map(b=>['boss:'+b.id,b.name])];
    if(!opts.some(([id])=>id===selection))selection='frame:ui';
    const [kind,id]=selection.split(':');
    const field=(key,title,value,min=0,max=1000000,step=1)=>'<label>'+title+'<input type="number" data-edit="'+key+'" value="'+value+'" min="'+min+'" max="'+max+'" step="'+step+'"></label>';
    const pos=value=>'<label>배치 칸<select data-edit="pos">'+(kind==='unit'?'<option value="WAIT"'+(value==null?' selected':'')+'>출발 대기</option>':'')+Object.keys(nodes).filter(p=>p!=='END'&&(kind==='unit'||!nodes[p].aliasOf)).map(p=>'<option value="'+p+'"'+(value===p?' selected':'')+'>'+esc(labelPos(p))+'</option>').join('')+'</select></label>';
    let fields='';
    if(kind==='frame')fields=field('scoreWidth','점수 패널 너비',layout.scoreWidth,140,280)+field('intelWidth','보스 패널 너비',layout.intelWidth,150,300)+field('fontSize','글자 크기',layout.fontSize,12,20)+'<label>강조색<input type="color" data-edit="accent" value="'+layout.accent+'"></label>';
    if(kind==='node')fields=field('x','X 시각 좌표',nodes[id].x,0,5.65,.01)+field('y','Y 시각 좌표',nodes[id].y,0,7.3,.01);
    if(kind==='rules')fields=field('target','목표 점수',st.target,1,D.boxing.maxWeight)+field('score','정산 점수(장면용)',st.score,0,D.boxing.maxWeight*4)+field('tosses','남은 투척',st.tosses,0,99)+field('swaps','남은 교체',st.swaps,0,99)+field('coins','재화',st.coins,0,1000000000)+field('risk','특성 위험도',st.trait?.risk||0,0,5);
    if(kind==='unit'||kind==='boss'){
      const p=kind==='unit'?st.pieces[+id]:st.guards.find(b=>b.id===id),g=kind==='unit'?st.groups.find(g=>g.ids.includes(+id)):p;
      fields=pos(g?.pos??null)+field('weight','현재 weight',p.weight,0,D.boxing.maxWeight)+field('hp','현재 HP',p.hp,0,D.boxing.maxWeight)+
        field('baseHealth','기본 HP',p.baseHealth,1,1000000,.01)+field('baseAttack','기본 공격',p.baseAttack,0,1000000,.01)+field('healthCoeff','weight → HP 계수',p.healthCoeff,0,5,.01)+field('attackCoeff','weight → 공격 계수',p.attackCoeff,0,5,.01)+field('healthFactor','윷/보스 HP 배율',p.healthFactor,.1,10,.01)+field('attackFactor','윷/보스 공격 배율',p.attackFactor,.1,10,.01)+(kind==='unit'?field('moveSpeed','기본 이동속도',p.moveSpeed,1,6)+field('moveBonus','라운드 이동 보너스',p.moveBonus||0,-2,3):'')+
        '<p class="box-muted">현재 최대 HP '+num(core.stats(p).maxHp)+' / 공격 '+num(core.stats(p).attack)+'. 수치 변경 후 HP는 새 최대 HP 이하로 적용합니다. 말 HP/weight가 0이면 사망입니다.</p>';
      if(kind==='unit')fields+='<label><input type="checkbox" data-edit="persist"> 기본 능력치·계수를 이후 라운드 원형에도 반영</label>';
    }
    if(kind==='master')fields=field('cycle','갱신 주기(턴)',st.master.cycle,1,9)+'<label>현재 판 전체 특성<select data-edit="roundTrait">'+D.roundTraits.map(t=>'<option value="'+t.id+'"'+(core.currentPlan().roundTraitId===t.id?' selected':'')+'>'+esc(t.name+' · '+t.effect)+'</option>').join('')+'</select></label>'+button('특수칸 추가','add-tile');
    if(kind==='tile'){const tile=core.currentPlan().tiles.find(t=>t.pos===id);fields=pos(tile.pos)+'<label>종류<select data-edit="tileType">'+D.specialTiles.map(t=>'<option value="'+t.id+'"'+(tile.type===t.id?' selected':'')+'>'+esc(t.name+' · '+t.effect)+'</option>').join('')+'</select></label>'+button('이 특수칸 삭제','delete-tile',id);}
    return '<div class="box-editor"><h4>장면 편집 · 진행 일시정지</h4><label>편집 대상<select id="boxEditObject">'+opts.map(([value,text])=>'<option value="'+value+'"'+(selection===value?' selected':'')+'>'+esc(text)+'</option>').join('')+'</select></label><div class="box-editor-grid">'+fields+'</div>'+button('변경 적용','apply-edit','','','box-primary')+' '+button('장면 저장','save')+'<p class="box-editor-message" role="status">'+esc(message)+'</p><p class="box-muted">칸은 시각 좌표, 말·보스는 가까운 칸으로 드래그합니다. 말 위치를 바꾸면 해당 묶음의 빽도 이력을 다시 구성합니다. 위험도 변경은 보스의 기본 체력·공격 계수를 재계산합니다.</p></div>';
  }
  function warp(g,pos) {
    g.pos=pos;if(pos==null){g.route='outer';g.history=[];return;}
    if(!D.board.routes[g.route].includes(pos))g.route=Object.keys(D.board.routes).find(r=>D.board.routes[r].includes(pos));
    g.history=D.board.routes[g.route].slice(0,D.board.routes[g.route].indexOf(pos)).map(p=>({pos:p==='0'?null:p,route:g.route}));
  }
  function applyEdit() {
    if(!edit)return;
    try {
      const values=Object.fromEntries([...root.querySelectorAll('[data-edit]')].map(el=>[el.dataset.edit,el.type==='checkbox'?el.checked:el.value]));
      const read=(key,min,max,integer=false)=>{const v=+values[key];if(values[key]===''||!Number.isFinite(v)||v<min||v>max||(integer&&!Number.isInteger(v)))throw new Error(key+' 범위 '+min+'~'+max);return v;};
      const [kind,id]=selection.split(':'),st=s();
      if(kind==='frame'){
        const frame={scoreWidth:read('scoreWidth',140,280,true),intelWidth:read('intelWidth',150,300,true),fontSize:read('fontSize',12,20,true),accent:values.accent};
        if(!/^#[0-9a-f]{6}$/i.test(frame.accent))throw new Error('강조색은 HEX 6자리입니다.');Object.assign(layout,frame);
      }
      if(kind==='node'){const x=read('x',0,5.65),y=read('y',0,7.3);Object.assign(nodes[id],{x,y});}
      if(kind==='rules'){
        if(!['SELECT','MOVE'].includes(st.phase))throw new Error('출전 후 자원을 편집하세요.');
        const next={target:read('target',1,D.boxing.maxWeight,true),score:read('score',0,D.boxing.maxWeight*4,true),tosses:read('tosses',0,99,true),swaps:read('swaps',0,99,true),coins:read('coins',0,1000000000,true)};
        const r=read('risk',0,5,true),oldRisk=st.trait.risk;Object.assign(st,next);st.trait={...st.trait,risk:r};
        if(r!==oldRisk){const fresh=core.bossUnits();for(const b of st.guards){const next=fresh.find(n=>n.id===b.id);if(next){const missing=core.stats(b).maxHp-b.hp,position=b.pos,dead=b.hp===0;Object.assign(b,next,{pos:position,hp:dead?0:Math.max(1,core.stats(next).maxHp-missing)});}}}
      }
      if(kind==='master'){const cycle=read('cycle',1,9,true);if(!D.roundTraits.some(t=>t.id===values.roundTrait))throw new Error('없는 판 전체 특성입니다.');st.master.cycle=cycle;core.currentPlan().roundTraitId=values.roundTrait;}
      if(kind==='tile'){const tile=core.currentPlan().tiles.find(t=>t.pos===id);if(!Object.hasOwn(nodes,values.pos)||values.pos==='END'||nodes[values.pos].aliasOf||!D.specialTiles.some(t=>t.id===values.tileType)||core.currentPlan().tiles.some(t=>t!==tile&&t.pos===values.pos))throw new Error('특수칸의 위치·종류·중복을 확인하세요.');tile.pos=values.pos;tile.type=values.tileType;selection='tile:'+tile.pos;}
      if(kind==='unit'||kind==='boss'){
        const p=kind==='unit'?st.pieces[+id]:st.guards.find(b=>b.id===id);
        const next={weight:read('weight',0,D.boxing.maxWeight,true),hp:read('hp',0,D.boxing.maxWeight,true),baseHealth:read('baseHealth',1,1000000),baseAttack:read('baseAttack',0,1000000),healthCoeff:read('healthCoeff',0,5),attackCoeff:read('attackCoeff',0,5),healthFactor:read('healthFactor',.1,10),attackFactor:read('attackFactor',.1,10)};
        const position=values.pos==='WAIT'?null:values.pos;if(position!=null&&(!Object.hasOwn(nodes,position)||position==='END'||(kind==='boss'&&nodes[position].aliasOf)))throw new Error('유효한 칸을 선택하세요.');if(kind==='boss'&&position==null)throw new Error('보스는 칸에 배치해야 합니다.');
        if(kind==='unit'){next.moveSpeed=read('moveSpeed',1,6,true);next.moveBonus=read('moveBonus',-2,3,true);}
        Object.assign(p,next);p.hp=Math.min(p.hp,core.stats(p).maxHp);
        if(kind==='boss')p.pos=position;
        else {
          p.dead=p.hp===0||p.weight===0;if(p.dead){p.hp=0;p.weight=0;for(const g of st.groups)g.ids=g.ids.filter(v=>v!==p.id);st.groups=st.groups.filter(g=>g.ids.length);}
          else {let g=st.groups.find(g=>g.ids.includes(p.id));if(!g){g={id:Math.max(3,...st.groups.map(g=>g.id))+1,ids:[p.id],pos:null,route:'outer',history:[]};st.groups.push(g);}warp(g,position);}
          if(values.persist)Object.assign(st.templates[p.id],{baseWeight:Math.max(1,p.weight),baseHealth:p.baseHealth,baseAttack:p.baseAttack,healthCoeff:p.healthCoeff,attackCoeff:p.attackCoeff,moveSpeed:p.moveSpeed});
        }
      }
      core.updateRecord(st);core.log('[편집] '+selection+' 적용.');core.touched();message='적용했습니다. 편집 종료 후 같은 장면에서 플레이하세요.';
    }catch(error){message=error.message;}
    render();
  }
  function saveScene() {
    if(battle)return;
    const data={kind:'yutochess-boxing-scene',sceneVersion:2,dataVersion:D.version,layout,layers,nodes:Object.values(nodes),forced,state:s()};
    const blob=new Blob(['\uFEFF'+JSON.stringify(data,null,2)],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='yutochess-build-'+s().seed+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function loadScene(data) {
    const check=(ok,text)=>{if(!ok)throw new Error(text);};
    const number=(v,min=0,max=Number.MAX_SAFE_INTEGER/2)=>Number.isFinite(v)&&v>=min&&v<=max;
    const integer=(v,min=0,max=1000000)=>Number.isInteger(v)&&v>=min&&v<=max;
    const list=(v,max)=>Array.isArray(v)&&v.length<=max;
    const position=p=>p==null||p==='END'||Object.hasOwn(nodes,p);
    check(data?.kind==='yutochess-boxing-scene'&&data.sceneVersion===2&&data.dataVersion===D.version,'1.5 데이터 / 장면 형식 2의 JSON이 필요합니다. 이전 경로·HP 규칙 장면은 호환되지 않습니다.');
    const q=data.state,ui=data.layout;
    check(q&&ui&&Object.hasOwn(phaseNames,q.phase)&&integer(q.round,0,core.rounds.length-1)&&integer(q.turn,0,10000)&&integer(q.seed,0,4294967295)&&integer(q.rng,0,4294967295)&&integer(q.serial,0,1000000)&&integer(q.revision,0,10000000),'진행/시드 값 오류');
    check(number(q.coins,0,Number.MAX_SAFE_INTEGER/2)&&number(q.score)&&number(q.total)&&number(q.target)&&integer(q.tosses,0,10000)&&integer(q.swaps,0,99)&&integer(q.capacity,4,D.boxing.deckCapacityMax),'라운드 자원 값 오류');
    check(list(q.collection,32)&&q.collection.every(i=>integer(i.uid,1,1000000)&&Object.hasOwn(core.stickById,i.type)&&integer(i.level,0,10))&&new Set(q.collection.map(i=>i.uid)).size===q.collection.length,'보유 윷 값 오류');
    const owned=new Set(q.collection.map(i=>i.uid));
    for(const key of ['deck','hand','draw','selected'])check(list(q[key],16)&&q[key].every(uid=>owned.has(uid))&&new Set(q[key]).size===q[key].length,'덱/손패 값 오류');
    check(q.deck.length<=q.capacity&&q.selected.length<=4&&q.selected.every(uid=>q.hand.includes(uid)),'출전 구성/선택 값 오류');
    if(['SELECT','MOVE'].includes(q.phase)){const pool=[...q.hand,...q.draw];check(q.deck.length>=4&&pool.length===q.deck.length&&new Set(pool).size===pool.length&&pool.every(uid=>q.deck.includes(uid)),'손패와 셔플 덱의 구성이 다릅니다.');}
    check(list(q.deckTraits,3)&&q.deckTraits.every(t=>Object.hasOwn(core.traitById,t.id)&&integer(t.level,1,3))&&new Set(q.deckTraits.map(t=>t.id)).size===q.deckTraits.length,'덱 특성 값 오류');
    const validTraits=traits=>list(traits,2)&&traits.every(id=>Object.hasOwn(core.pieceTraitById,id))&&new Set(traits).size===traits.length;
    const baseUnit=p=>p&&number(p.baseHealth,1,1000000)&&number(p.baseAttack,0,1000000)&&number(p.healthCoeff,0,5)&&number(p.attackCoeff,0,5)&&(p.moveSpeed==null||integer(p.moveSpeed,1,6))&&validTraits(p.traits);
    check(list(q.templates,4)&&q.templates.length===4&&q.templates.every((p,i)=>p.id===i&&integer(p.level,0,6)&&number(p.baseWeight,1,D.boxing.maxWeight)&&baseUnit(p)&&integer(p.moveSpeed,1,6)),'말 원형 값 오류');
    const liveUnit=p=>baseUnit(p)&&number(p.weight,0,D.boxing.maxWeight)&&number(p.healthFactor,.1,10)&&number(p.attackFactor,.1,10)&&number(p.hp,0,core.stats(p).maxHp);
    check(list(q.pieces,4)&&q.pieces.every((p,i)=>p.id===i&&liveUnit(p)&&typeof p.dead==='boolean'&&typeof p.settled==='boolean'&&integer(p.moveSpeed,1,6)&&integer(p.moveBonus,-2,3)&&(p.dead?(p.hp===0&&p.weight===0):(p.hp>0&&p.weight>0))&&list(p.effects,10000)),'라운드 말 값 오류');
    check(list(q.groups,4)&&new Set(q.groups.map(g=>g.id)).size===q.groups.length&&q.groups.every(g=>integer(g.id,0,1000000)&&list(g.ids,4)&&g.ids.length&&g.ids.every(id=>integer(id,0,3)&&q.pieces[id]&&!q.pieces[id].dead)&&position(g.pos)&&Object.hasOwn(D.board.routes,g.route)&&(g.pos==null||D.board.routes[g.route].includes(g.pos))&&list(g.history,10000)&&g.history.every(h=>position(h.pos)&&Object.hasOwn(D.board.routes,h.route))),'묶음/경로 값 오류');
    const ids=q.groups.flatMap(g=>g.ids);check(new Set(ids).size===ids.length&&ids.length===q.pieces.filter(p=>!p.dead).length&&q.groups.every(g=>g.ids.every(id=>q.pieces[id].settled===(g.pos==='END'))),'말의 생존/완주 소속 값 오류');
    check(list(q.guards,5)&&q.guards.every(b=>liveUnit(b)&&/^boss-[0-4]$/.test(b.id)&&D.guardians.some(d=>d.id===b.kind)&&['shortcut','gate','extra'].includes(b.role)&&typeof b.name==='string'&&b.name.length<80&&Object.hasOwn(nodes,b.pos)&&b.pos!=='END'&&!nodes[b.pos].aliasOf)&&new Set(q.guards.map(b=>b.id)).size===q.guards.length,'보스 값 오류');
    check(list(q.riskOffers,3)&&q.riskOffers.every(id=>D.riskChoices.some(t=>t.id===id))&&list(q.charms,5)&&q.charms.every(id=>D.shopPool.charms.includes(id)),'특성 선택지/부적 값 오류');
    if(q.trait)check(D.riskChoices.some(t=>t.id===q.trait.id)&&integer(q.trait.risk,0,5)&&number(q.trait.targetX,.1,10)&&number(q.trait.rewardX,.1,10),'라운드 특성 값 오류');
    if(['PREP','SELECT','MOVE','REWARD','SHOP','WIN','LOSE'].includes(q.phase))check(!!q.trait,'선택한 라운드 특성이 없습니다.');
    if(q.phase==='MOVE')check(q.pending&&list(q.pending.items,4)&&q.pending.items.length===4&&new Set(q.pending.items).size===4&&q.pending.items.every(uid=>owned.has(uid))&&list(q.pending.faces,4)&&q.pending.faces.length===4&&q.pending.faces.every(f=>['flat','back'].includes(f))&&D.hands.some(h=>h.id===q.pending.hand?.id),'투척 결과 값 오류');
    check(list(q.shop,3)&&q.shop.every(o=>integer(o.index,0,2)&&['stick','deckTrait','pieceTrait','charm'].includes(o.kind)&&typeof o.sold==='boolean'&&(o.kind==='stick'?D.shopPool.sticks:o.kind==='deckTrait'?D.shopPool.deckTraits:o.kind==='pieceTrait'?D.shopPool.pieceTraits:D.shopPool.charms).includes(o.ref))&&integer(q.rerolls,0,10000),'상점 값 오류');
    if(q.phase==='REWARD')check(q.reward&&['base','remaining','interest','overflow','bonus','sum'].every(key=>number(q.reward[key]))&&q.reward.sum===q.reward.base+q.reward.remaining+q.reward.interest+q.reward.bonus,'보상 값 오류');
    check(q.record&&Object.keys(s().record).every(key=>number(q.record[key]))&&list(q.log,100000)&&q.log.every(e=>typeof e.round==='string'&&e.round.length<20&&integer(e.turn,0,10000)&&typeof e.message==='string'&&e.message.length<4000),'기록 값 오류');
    check(integer(ui.scoreWidth,140,280)&&integer(ui.intelWidth,150,300)&&integer(ui.fontSize,12,20)&&/^#[0-9a-f]{6}$/i.test(ui.accent),'UI 값 오류');
    check(list(data.nodes,Object.keys(nodes).length)&&data.nodes.length===Object.keys(nodes).length&&new Set(data.nodes.map(n=>n.id)).size===data.nodes.length&&data.nodes.every(n=>Object.hasOwn(nodes,n.id)&&number(n.x,0,5.65)&&number(n.y,0,7.3)),'보드 좌표 값 오류');
    check(data.forced===''||D.hands.some(h=>h.id===data.forced),'고정 결과 값 오류');
    if(['SELECT','MOVE','REWARD','SHOP','WIN','LOSE'].includes(q.phase))check(q.pieces.length===4&&q.guards.length>=2,'라운드 말·보스 구성이 필요합니다.');
    if(q.master)check(integer(q.master.cycle,1,9)&&list(q.master.plans,36)&&q.master.plans.length>0&&integer(q.master.index,0,q.master.plans.length-1)&&q.master.plans.every(p=>D.roundTraits.some(t=>t.id===p.roundTraitId)&&list(p.tiles,8)&&new Set(p.tiles.map(t=>t.pos)).size===p.tiles.length&&p.tiles.every(t=>Object.hasOwn(nodes,t.pos)&&t.pos!=='END'&&!nodes[t.pos].aliasOf&&D.specialTiles.some(d=>d.id===t.type))),'마스터 계획 값 오류');
    if(['SELECT','MOVE','REWARD','SHOP','WIN','LOSE'].includes(q.phase))check(!!q.master,'마스터 계획이 없습니다.');
    check(q.activeGroupId==null||integer(q.activeGroupId,0,1000000),'진행 말 값 오류');
    if(q.lastTurn)check(integer(q.lastTurn.turn,0,10000)&&typeof q.lastTurn.hand==='string'&&q.lastTurn.hand.length<20&&typeof q.lastTurn.group==='string'&&q.lastTurn.group.length<20&&['n','m','x','gain','weightBefore','weightAfter','scoreGain'].every(k=>number(q.lastTurn[k]))&&position(q.lastTurn.arrival),'직전 결과 값 오류');
    const restored=structuredClone(q);restored.serial=Math.max(restored.serial,...q.collection.map(i=>i.uid),0);
    if(restored.pending)restored.pending.hand=D.hands.find(h=>h.id===restored.pending.hand.id);
    if(restored.trait)restored.trait={...D.riskChoices.find(t=>t.id===restored.trait.id),risk:restored.trait.risk};
    core.replaceState(restored);Object.assign(layout,{scoreWidth:ui.scoreWidth,intelWidth:ui.intelWidth,fontSize:ui.fontSize,accent:ui.accent});for(const n of data.nodes)Object.assign(nodes[n.id],{x:n.x,y:n.y});for(const key of Object.keys(layers))if(typeof data.layers?.[key]==='boolean')layers[key]=data.layers[key];
    forced=data.forced;edit=true;hover=null;message='장면을 복원했습니다. 편집 종료 후 플레이하세요.';core.log('[장면] 배치·시드·손패·성장·상점 복원.');
  }
  function render() {
    const openDetails=new Set([...root.querySelectorAll('details[data-box-detail][open]')].map(el=>el.dataset.boxDetail));
    const focused=document.activeElement?.closest('[data-action]'),focusAction=focused?.dataset.action,focusValue=focused?.dataset.value;
    const st=s(),focus=root.contains(document.activeElement),play=['SELECT','MOVE'].includes(st.phase),showBoard=play||edit;
    root.classList.toggle('editing',edit);root.style.setProperty('--box-score-width',layout.scoreWidth+'px');root.style.setProperty('--box-intel-width',layout.intelWidth+'px');root.style.setProperty('--box-accent',layout.accent);root.style.fontSize=layout.fontSize+'px';
    const toolbar='<div class="box-top"><div><span class="box-eyebrow">YUTOCHESS / WEIGHT × POWER</span><h3>윷토체스</h3><p>업고, 곱하고, 돌파한다.</p></div><details class="box-header-tools"><summary>시드·새 런</summary><label>런 시드<input id="boxSeed" type="number" min="0" max="4294967295" value="'+st.seed+'"></label>'+button('메뉴 / 새 런','reset','',!!battle)+'</details>'+button(edit?'편집 종료 → 플레이':'편집 모드','editor','',!!battle)+'</div>';
    const status=st.phase==='MENU'?'':'<div class="box-status" aria-live="polite"><b>'+core.row().act+'막 · '+core.row().id+'</b><span>'+phaseNames[st.phase]+'</span><span>투척 '+st.tosses+' / 교체 '+st.swaps+'</span><span>출전 '+st.deck.length+'/'+st.capacity+'</span>'+(st.practice?'<b>연습 · 첫 3턴만 고정</b>':'')+'</div>';
    const loop=st.phase==='MENU'?'':'<div class="box-loop">'+['TRAIT','PREP','SELECT','REWARD','SHOP'].map((p,i)=>'<span>'+(i?' → ':'')+((st.phase===p||(p==='SELECT'&&st.phase==='MOVE'))?'<b>':'')+esc({TRAIT:'리스크 선택',PREP:'출전 편집',SELECT:'PvE',REWARD:'보상',SHOP:'상점'}[p])+((st.phase===p||(p==='SELECT'&&st.phase==='MOVE'))?'</b>':'')+'</span>').join('')+'</div>';
    const hints=['던지기 한 번으로 이동합니다. 작은 말을 큰 말에 업어 보세요.','업으면 보유점수와 다음 배율이 커집니다. 한 번 더 던져 보세요.','갈림길에서만 길을 고릅니다. 수문장에 멈추면 HP 전투!'];
    const hintIndex=Math.min(2,Math.max(0,st.phase==='MOVE'?st.turn-1:st.turn));
    const intro=play&&st.round===0&&(st.turn<3||st.phase==='MOVE'&&st.turn<=3)?'<div class="box-hook"><b>'+(st.practice?'체험 '+(hintIndex+1)+'/3 · '+D.hands.find(h=>h.id===D.onboarding.firstThreeHands[hintIndex]).name+' 고정 — ':'')+hints[hintIndex]+'</b>'+(st.practice?button('체험 종료 · 실제 런 시작','start-real'):'')+'</div>':st.practice?'<div class="box-hook"><b>3턴 체험 이후는 시드 난수입니다.</b>'+button('실제 런 시작','start-real','','','box-primary')+'</div>':'';
    const game=showBoard?handPanel()+'<div class="box-layout"><aside class="box-score">'+roster()+'</aside><div class="box-board">'+board()+'<p class="box-board-key">● 내 말　■ 보스　◇ 특수칸</p></div><aside class="box-intel">'+intel()+'</aside></div>':'';
    const compact=!showBoard&&st.phase!=='MENU'?'<p class="box-stage-wallet">현재 '+st.coins+'냥 · 예상 이자 +'+core.interest()+'냥 · 다음 기본 목표 '+(core.rounds[st.round+1]?num(core.rounds[st.round+1].target):'마지막 라운드')+'</p>':'';
    root.innerHTML=toolbar+loop+status+(play?summary():'')+intro+(!play&&st.lastTurn?turnResult():'')+compact+(edit?editorPanel():'')+(showBoard?(st.master&&st.round===0&&st.turn<=3?'<details class="box-master-fold" data-box-detail="master"><summary>마스터 · '+esc(core.field().effect)+'</summary>'+masterPanel()+'</details>':masterPanel()):'')+game+'<div class="box-stage">'+stage()+'</div>'+
      (st.log.length&&st.phase!=='MENU'?'<p class="box-feedback" aria-live="polite">'+esc(st.log.at(-1).message)+'</p>':'')+machine()+'<details class="box-events"><summary>상세 사건 기록 · '+st.log.length+'건</summary><ol>'+st.log.slice(-50).reverse().map(e=>'<li><small>'+esc(e.round)+' / '+e.turn+'T</small> '+esc(e.message)+'</li>').join('')+'</ol></details>'+animationPanel();
    for(const el of root.querySelectorAll('details[data-box-detail]'))el.open=openDetails.has(el.dataset.boxDetail);
    updateUpgradeInfo();
    if(battle)root.querySelector('.box-battle-actions button')?.focus({preventScroll:true});else if(focus){const next=[...root.querySelectorAll('[data-action]')].find(el=>el.dataset.action===focusAction&&el.dataset.value===focusValue&&!el.disabled);(next||root).focus({preventScroll:true});}
  }
  function updateUpgradeInfo() {
    const select=root.querySelector('#boxOwned'),el=root.querySelector('#boxUpgradeInfo');if(!select||!el)return;
    const i=core.item(+select.value),next=i&&D.stickUpgrade.levels.find(l=>l.level===i.level+1);el.textContent=next?'다음 강화 '+core.price(next.cost)+'냥 / 성공 '+(next.success*100).toFixed(0)+'% / 실패 '+(next.onFail==='keep'?'유지':'하락'):'최대 단계입니다.';
  }
  root.addEventListener('click',event=>{
    const object=event.target.closest('[data-edit-kind]');if(edit&&object){selection=object.dataset.editKind+':'+object.dataset.editId;render();return;}
    const target=event.target.closest('[data-action]');if(!target||target.disabled)return;const action=target.dataset.action,value=target.dataset.value;
    if(action==='skip-battle'){finishAnimation();return;}
    if(action==='close-battle'&&battle?.done){battle=null;render();return;}
    if(battle)return;
    if(action==='editor'){edit=!edit;message='';if(!edit){core.reconcile();resolveRoll();}else render();return;}
    if(action==='save'){saveScene();return;}
    if(edit&&action==='add-tile'){const p=core.currentPlan(),free=Object.keys(nodes).find(id=>!['0','J','C','G','END'].includes(id)&&!p.tiles.some(t=>t.pos===id));if(free&&p.tiles.length<8){p.tiles.push({pos:free,type:'fortune'});core.touched();selection='tile:'+free;}render();return;}
    if(edit&&action==='delete-tile'){const p=core.currentPlan();p.tiles=p.tiles.filter(t=>t.pos!==value);selection='master:stage';core.touched();render();return;}
    if(action==='apply-edit'){applyEdit();return;}
    if(edit&&action!=='reset')return;
    switch(action){
      case 'reset':core.reset(Number(root.querySelector('#boxSeed').value)||0);edit=false;forced='';hover=null;break;
      case 'start-real':quickRun();break;
      case 'upgrade-target':core.upgradePiece(Number(root.querySelector('#boxShopPiece')?.value)||0);break;
      case 'quickstart':quickRun();break;
      case 'practice':core.scenario('stack');s().practice=true;forced='';break;
      case 'deck':core.chooseDeck(value);break;
      case 'risk':core.chooseRisk(value);break;
      case 'loadout':core.toggleDeck(+value);break;
      case 'start':core.startRound();break;
      case 'card':core.select(+value);break;
      case 'swap':core.swap();break;
      case 'toss':tossAndMove();return;
      case 'active':core.setActive(+value);break;
      case 'route':beginMove(core.activeGroup().id,value);return;
      case 'resume':resolveRoll();return;
      case 'reward':core.claimReward();break;
      case 'next':core.nextRound();hover=null;break;
      case 'buy':core.buy(+value,Number(root.querySelector('#boxShopPiece')?.value)||0,Number(root.querySelector('#boxReplace')?.value)||0);break;
      case 'reroll':core.reroll();break;
      case 'capacity':core.capacity();break;
      case 'upgrade-stick':core.upgradeStick(+root.querySelector('#boxOwned').value);break;
      case 'delete-stick':core.removeItem(+root.querySelector('#boxOwned').value);break;
      case 'sell-stick':core.removeItem(+root.querySelector('#boxOwned').value,true);break;
      case 'upgrade-trait':core.upgradeDeckTrait(+value);break;
      case 'remove-trait':core.removeDeckTrait(+value);break;
      case 'upgrade-piece':core.upgradePiece(+value);break;
      case 'remove-piece-trait':{const [id,index]=value.split(':').map(Number);core.removePieceTrait(id,index);break;}
      case 'scenario':core.scenario(value);forced='do';hover=null;break;
    }
    render();
  });
  root.addEventListener('change',async event=>{
    if(battle)return;
    const el=event.target;
    if(el.id==='boxForced'){forced=el.value;return;}
    if(el.id==='boxShopPiece'){const t=s().templates[+el.value],box=root.querySelector('.box-simple-growth span');if(box)box.textContent=t.level>=6?'최대 강화 단계':'비용 '+core.price(D.boxing.pieceUpgradeCost*(t.level+1))+'냥 · 다음 라운드 적용';const upgrade=root.querySelector('[data-action="upgrade-target"]');if(upgrade)upgrade.disabled=locked()||t.level>=6||s().coins<core.price(D.boxing.pieceUpgradeCost*(t.level+1));return;}
    if(el.id==='boxOwned'){updateUpgradeInfo();return;}
    if(el.id==='boxEditObject'){selection=el.value;message='';render();return;}
    if(el.dataset.layerToggle){layers[el.dataset.layerToggle]=el.checked;const layer=root.querySelector('[data-layer="'+el.dataset.layerToggle+'"]');if(layer)layer.style.display=el.checked?'':'none';return;}
    if(el.id==='boxScene'&&el.files[0]){try{loadScene(JSON.parse((await el.files[0].text()).replace(/^\uFEFF/,'')));}catch(error){edit=true;message='불러오기 실패: '+error.message;}render();}
  });
  root.addEventListener('keydown',event=>{
    if(event.target.matches('input,select,textarea,summary'))return;
    if(battle){if(event.key==='Tab'){const buttons=[...root.querySelectorAll('.box-battle-actions button:not(:disabled)')];if(buttons.length){event.preventDefault();const at=buttons.indexOf(document.activeElement),next=(at+(event.shiftKey?-1:1)+buttons.length)%buttons.length;buttons[next].focus();}}if(event.key==='Escape'){if(battle.done){battle=null;render();}else finishAnimation();}return;}
    if(edit)return;
    const token=event.target.closest('.box-piece');if(token&&['Enter',' '].includes(event.key)){event.preventDefault();core.setActive(+token.dataset.value);render();return;}
    if(s().phase==='SELECT'&&event.key===' '){event.preventDefault();tossAndMove();}
    if(s().phase==='SELECT'&&event.key.toLowerCase()==='r'){core.swap();render();}
    if(s().phase==='SELECT'&&/^[1-6]$/.test(event.key)&&s().hand[+event.key-1]){core.select(s().hand[+event.key-1]);const panel=root.querySelector('.box-hand-edit');if(panel)panel.open=true;render();}
  });
  root.addEventListener('pointerdown',event=>{
    if(!edit||event.button!==0||battle)return;const target=event.target.closest('[data-edit-kind]');if(!target)return;
    event.preventDefault();selection=target.dataset.editKind+':'+target.dataset.editId;drag={kind:target.dataset.editKind,id:target.dataset.editId,pointer:event.pointerId,moved:false};root.setPointerCapture(event.pointerId);
  });
  root.addEventListener('pointermove',event=>{
    if(!drag||event.pointerId!==drag.pointer)return;const svg=root.querySelector('.box-board svg'),matrix=svg?.getScreenCTM();if(!matrix)return;
    const p=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse()),x=Math.max(0,Math.min(5.65,(p.x-70)/80)),y=Math.max(0,Math.min(7.3,(p.y-70)/80));
    if(drag.kind==='node')Object.assign(nodes[drag.id],{x:Math.round(x*100)/100,y:Math.round(y*100)/100});
    else {let nearest=Object.values(nodes).filter(n=>n.id!=='END'&&!n.aliasOf).sort((a,b)=>Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y))[0].id;
      if(drag.kind==='unit'&&nearest==='0'){const g=s().groups.find(g=>g.ids.includes(+drag.id));if(g?.pos!=null)nearest='J';}
      if(drag.kind==='tile'){const tile=core.currentPlan().tiles.find(t=>t.pos===drag.id);if(tile&&!core.currentPlan().tiles.some(t=>t!==tile&&t.pos===nearest)){tile.pos=nearest;drag.id=nearest;selection='tile:'+nearest;}}
      if(drag.kind==='boss')s().guards.find(g=>g.id===drag.id).pos=nearest;
      if(drag.kind==='unit'){const g=s().groups.find(g=>g.ids.includes(+drag.id));if(g)warp(g,nearest);}}
    drag.moved=true;svg.outerHTML=board();
  });
  function endDrag(event){if(!drag||event.pointerId!==drag.pointer)return;if(root.hasPointerCapture(drag.pointer))root.releasePointerCapture(drag.pointer);if(drag.moved){core.log('[편집] '+selection+' 드래그 배치.');core.touched();}drag=null;render();}
  root.addEventListener('pointerup',endDrag);root.addEventListener('pointercancel',endDrag);
  window.YutoBoxing={mount(data){
    if(timer!=null)clearTimeout(timer);battle=null;D=data;core=window.YutoCore.create(data);nodes=Object.fromEntries(D.board.nodes.map(n=>[n.id,{...n}]));edit=false;forced='';hover=null;message='';render();
  }};
})();
