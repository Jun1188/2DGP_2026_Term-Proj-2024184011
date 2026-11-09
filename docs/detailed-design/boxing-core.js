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
    const item=(uid,st=s)=>st.collection.find(i=>i.uid===uid);
    const weight=(g,st=s)=>g.ids.reduce((n,id)=>n+st.pieces[id].weight,0);
    const boardPos=id=>D.board.nodes.find(n=>n.id===id)?.aliasOf||id;
    const samePos=(a,b)=>a!=null&&b!=null&&boardPos(a)===boardPos(b);
    const living=(st=s)=>st.groups.filter(g=>g.pos!=='END'&&g.ids.length);
    const name=g=>g.ids.map(id=>'ABCD'[id]).join('+');
    const carrier=(g,st=s)=>[...g.ids].sort((a,b)=>st.pieces[b].weight-st.pieces[a].weight||a-b)[0];
    const activeGroup=(st=s)=>living(st).find(g=>g.id===st.activeGroupId)||[...living(st)].sort((a,b)=>weight(b,st)-weight(a,st)||a.id-b.id)[0]||null;
    function setActive(gid){if(s.phase==='SELECT'&&living().some(g=>g.id===gid)){s.activeGroupId=gid;touched();}}
    const sumTrait=(key,st=s)=>st.deckTraits.reduce((n,t)=>n+(traitById[t.id][key]||0)*t.level,0);
    const pieceFactor=(p,key)=>p.traits.reduce((n,id)=>n*(pieceTraitById[id]?.[key]||1),1);
    const currentPlan=(st=s)=>st.master?.plans[st.master.index]||null;
    const field=(st=s)=>D.roundTraits.find(t=>t.id===currentPlan(st)?.roundTraitId)||D.roundTraits[0];
    function stats(p,st=s) {
      return {maxHp:Math.max(1,Math.floor((p.baseHealth+p.weight*p.healthCoeff)*p.healthFactor*pieceFactor(p,'healthX'))),
        attack:Math.max(1,Math.floor((p.baseAttack+p.weight*p.attackCoeff)*p.attackFactor*pieceFactor(p,'attackX')*field(st).attackX))};
    }
    function sync(p,oldMax) {p.hp=Math.min(stats(p).maxHp,Math.max(0,p.hp+Math.max(0,stats(p).maxHp-oldMax)));}
    function grow(p,amount) {const old=stats(p).maxHp;p.weight=Math.min(C.maxWeight,Math.max(0,p.weight+Math.floor(amount)));sync(p,old);}
    function random() {s.rng=(Math.imul(s.rng,1664525)+1013904223)>>>0;return s.rng/4294967296;}
    function shuffle(values) {const a=[...values];for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
    function log(message,st=s) {st.log.push({round:row(st)?.id||'menu',turn:st.turn,message});}
    function touched() {s.revision++;}
    function addItem(type) {const i={uid:++s.serial,type,level:0};s.collection.push(i);return i.uid;}
    function drawHand() {const size=Math.min(s.deck.length,s.trait?.id==='tightHand'?4:R.handSize);while(s.hand.length<size&&s.draw.length)s.hand.push(s.draw.pop());if(s.phase==='SELECT'&&!s.selected.length)s.selected=s.hand.slice(0,R.sticksPerToss);}
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
      s={version:2,seed:seed>>>0,rng:seed>>>0,serial:0,revision:0,round:0,phase:'MENU',practice:false,activeGroupId:null,lastRoll:null,lastTurn:null,turn:0,startedAt:Date.now(),
        collection:[],deck:[],capacity:R.startingDeckMax,deckTraits:[],charms:[],coins:D.economy.startCoins,
        templates:Array.from({length:R.piecesPerPlayer},(_,id)=>({id,level:0,baseWeight:C.pieceBaseWeight,baseHealth:C.pieceBaseHealth,baseAttack:C.pieceBaseAttack,
          healthCoeff:C.pieceHealthWeightCoeff,attackCoeff:C.pieceAttackWeightCoeff,moveSpeed:C.pieceMoveSpeed,traits:[]})),
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
      const placements=[...row(st).bosses],count=Math.min(row(st).extraBossPosts.length,(row(st).extraBosses||0)+(st.trait?.extraBosses||0));
      for(let i=0;i<count;i++)placements.push({role:'extra',id:row(st).extraBossKinds[i%row(st).extraBossKinds.length],post:row(st).extraBossPosts[i]});
      return placements.map((placement,index)=>{
        const b=D.guardians.find(b=>b.id===placement.id),r=risk(st),healthScale=(1+r*C.riskHealthStep)*(st.trait?.bossGimmick==='calm'?0.9:1),attackScale=(1+r*C.riskAttackStep)*(st.trait?.bossGimmick==='calm'?0.9:1);
        const g={id:'boss-'+index,kind:b.id,role:placement.role,unitClass:b.kind,gimmick:b.gimmick,pickGimmick:st.trait?.bossGimmick||'none',name:b.name,pos:placement.post,
          weight:Math.round(b.weight*row(st).bossScale*healthScale),baseHealth:C.bossBaseHealth*healthScale,baseAttack:C.bossBaseAttack*attackScale,
          healthCoeff:C.bossHealthWeightCoeff,attackCoeff:C.bossAttackWeightCoeff,healthFactor:b.healthX,attackFactor:b.attackX*attackScale,traits:[],hp:1};
        g.hp=stats(g).maxHp;return g;
      });
    }
    function startRound() {
      if(s.phase!=='PREP')return;
      if(s.deck.length<R.minDeckSize||s.deck.length>s.capacity){log('출전 윷은 '+R.minDeckSize+'~'+s.capacity+'개여야 합니다.');return;}
      s.phase='SELECT';s.activeGroupId=0;s.lastRoll=null;s.lastTurn=null;s.turn=0;s.score=0;s.reward=null;s.pending=null;s.selected=[];
      const delta=s.deckTraits.reduce((n,t)=>n+(traitById[t.id].tossDelta||0),0);
      s.tosses=Math.max(1,R.tossesPerRound+delta+(s.charms.includes('lucky')?1:0)-(s.trait.id==='lastStand'?3:0));
      s.swaps=R.swapsPerRound;s.hand=[];s.draw=shuffle(s.deck);drawHand();
      s.pieces=s.templates.map(t=>{const p={...copy(t),weight:t.baseWeight+sumTrait('initialWeight'),healthFactor:1,attackFactor:1,hp:1,dead:false,settled:false,effects:[],moveBonus:0};p.hp=stats(p).maxHp;return p;});
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
      const out=[...s.selected];s.hand=s.hand.filter(uid=>!out.includes(uid));s.draw=shuffle([...s.draw,...out]);s.selected=[];s.swaps--;drawHand();touched();log(out.length+'개 교체 · 반환 후 셔플.');
    }
    function toss(forced='') {
      if(s.phase!=='SELECT'||s.selected.length!==R.sticksPerToss||s.tosses<=0)return;
      const items=[...s.selected];
      if(forced==='backdo'&&!items.some(uid=>stickById[item(uid).type].marked)){log('빽도 고정은 표시 윷이 필요합니다.');return;}
      let faces=items.map(uid=>random()<stickById[item(uid).type].pFlat?'flat':'back');
      if(forced){const h=D.hands.find(h=>h.id===forced);if(h){faces.fill('back');const order=items.map((_,i)=>i).sort((a,b)=>Number(!!stickById[item(items[a]).type].marked)-Number(!!stickById[item(items[b]).type].marked));if(forced==='backdo')faces[items.findIndex(uid=>stickById[item(uid).type].marked)]='flat';else order.slice(0,h.flats).forEach(i=>faces[i]='flat');}}
      const hand=handFor(items,faces);s.turn++;s.tosses--;s.pending={items,faces,hand,route:null};s.lastRoll={turn:s.turn,hand:hand.id,items:[...items],faces:[...faces]};s.selected=[];
      const active=activeGroup();
      const fallback=hand.move<0&&active?.pos==null?[...living()].filter(g=>g.pos!=null).sort((a,b)=>weight(b)-weight(a)||a.id-b.id)[0]:null;
      s.activeGroupId=(fallback||active)?.id??null;
      s.hand=s.hand.filter(uid=>!items.includes(uid));s.draw=shuffle([...s.draw,...items]);
      const fall=s.trait.id==='fall'&&random()<0.1;
      if(!fall&&R.extraTossOn.includes(hand.id))s.tosses++;
      log((forced?'[고정] ':'')+hand.name+' · '+calculate(s.pending).lines.join(' → '));touched();
      if(fall){s.lastTurn={turn:s.turn,hand:'fall',group:'',n:0,m:0,x:1,gain:0,weightBefore:0,weightAfter:0,scoreGain:0,arrival:null,skipped:true};log('낙: 이번 결과 무효. 투척 소모, 성장 없음.');finishTurn();return;}
      if(hand.move<0&&!living().some(g=>g.pos!=null)){s.lastTurn={turn:s.turn,hand:hand.id,group:'',n:0,m:0,x:1,gain:0,weightBefore:0,weightAfter:0,scoreGain:0,arrival:null,skipped:true};log('움직일 말이 없는 빽도. 귀속 생략.');finishTurn();return;}
      s.phase='MOVE';
    }
    function routeOptions(g,st=s) {
      if(!g)return [];
      const current=['5','10'].includes(g.pos)?'outer':g.route,ids=[current],branch=g.pos!=null?D.board.branchOnStop[g.pos]:null;
      if(st.pending?.hand.move>=0&&branch&&st.trait.id!=='shortcut'&&!st.guards.some(b=>b.hp>0&&samePos(b.pos,g.pos)))ids.push(branch);
      const seen=new Set();
      return [...new Set(ids)].filter(id=>{const route=D.board.routes[id],index=g.pos==null?0:route.indexOf(g.pos);if(index<0)return false;const key=route.slice(index).join('>');if(seen.has(key))return false;seen.add(key);return true;}).map(id=>({id,name:id===branch?'지름길':'현재 길'}));
    }
    function plan(g,st=s) {
      const currentBoss=st.guards.find(b=>b.hp>0&&samePos(b.pos,g.pos));
      if(currentBoss)return [];
      const raw=st.pending.hand.move,main=st.pieces[carrier(g,st)],count=raw<0?-1:Math.max(1,raw+main.moveSpeed-1+(main.moveBonus||0)+field(st).speedBonus);
      if(count<0)return g.pos==null?[]:[g.history.at(-1)||{pos:null,route:'outer'}];
      let pos=g.pos??'0',route=g.pos==null?'outer':g.route;
      const options=routeOptions(g,st);if(options.some(o=>o.id===st.pending.route))route=st.pending.route;else if(options.length)route=options[0].id;
      const path=D.board.routes[route],out=[];let i=path.indexOf(pos);
      for(let step=0;step<count;step++){i++;pos=path[i]||'END';out.push({pos,route});if(pos==='G'||pos==='END')break;}
      return out;
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
      const candidates=D.board.nodes.map(n=>n.id).filter(id=>!['0','J','C','G','END'].includes(id)&&!s.guards.some(b=>b.pos===id));
      const plans=[];
      for(let i=0;i<D.gameMaster.planCount;i++){
        const count=s.round===0?2:D.gameMaster.minTiles+Math.floor(random()*(D.gameMaster.maxTiles-D.gameMaster.minTiles+1));
        const positions=i===0&&s.round===0?['5','7']:shuffle(candidates).slice(0,count);
        const tiles=positions.map((pos,index)=>({pos,type:s.round===0?(index===0?'fortune':'well'):(i===0&&index===0?'fortune':D.specialTiles[Math.floor(random()*D.specialTiles.length)].id)}));
        const roundTraitId=i===0||s.round===0?'calm':s.round===1?'leanWind':D.roundTraits[1+Math.floor(random()*(D.roundTraits.length-1))].id;
        plans.push({tiles,roundTraitId});
      }
      return {index:0,cycle:D.gameMaster.cycleTurns,plans};
    }
    function removeDepleted(st) {
      for(const p of st.pieces)if(!p.dead&&!p.settled&&(p.hp<=0||p.weight<=0)){p.hp=0;p.weight=0;p.dead=true;log('말 '+'ABCD'[p.id]+' 사망 · 미정산 weight 소멸.',st);}
      for(const g of st.groups)g.ids=g.ids.filter(id=>!st.pieces[id].dead);
      st.groups=st.groups.filter(g=>g.ids.length);
    }
    function applyTile(g,st,events) {
      const tile=currentPlan(st)?.tiles.find(t=>samePos(t.pos,g.pos));if(!tile||!g.ids.length)return;
      const effect=D.specialTiles.find(t=>t.id===tile.type),p=st.pieces[carrier(g,st)];
      if(effect.weight)grow(p,effect.weight);
      if(effect.heal)p.hp=Math.min(stats(p,st).maxHp,p.hp+effect.heal);
      if(effect.damage)p.hp=Math.max(0,p.hp-effect.damage);
      if(effect.speed)p.moveBonus=Math.min(3,(p.moveBonus||0)+effect.speed);
      events.push({type:'master',title:'특수칸 · '+effect.name,message:effect.effect});log('마스터 특수칸 '+effect.name+' → 말 '+'ABCD'[p.id]+' · '+effect.effect,st);removeDepleted(st);
    }
    function masterPhase(st,events) {
      if(!st.master)return;
      const trait=field(st);
      if(trait.weightDrain){
        for(const p of st.pieces)if(!p.dead&&!p.settled)grow(p,-trait.weightDrain);
        for(const b of st.guards)if(b.hp>0){grow(b,-trait.weightDrain);if(b.weight===0)b.hp=0;}
        removeDepleted(st);events.push({type:'master',title:'판 전체 · '+trait.name,message:'생존 말·보스 weight -'+trait.weightDrain+' · 정산한 말 제외'});log(trait.name+' 턴말 weight -'+trait.weightDrain,st);
      }
      if(st.turn>0&&st.turn%st.master.cycle===0){
        st.master.index=(st.master.index+1)%st.master.plans.length;
        const next=currentPlan(st),active=field(st);events.push({type:'master',title:'게임 마스터 갱신',message:'특수칸 '+next.tiles.length+'개 재배치 · '+active.effect});log('게임 마스터: 특수칸 '+next.tiles.length+'개 / '+active.name+' → '+active.effect,st);
      }
    }

    function preview(gid,routeId=null) {
      if(s.phase!=='MOVE')return null;
      const source=s.groups.find(g=>g.id===gid);if(!source||source.pos==='END'||(source.pos==null&&s.pending.hand.move<0))return null;
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
        g.ids=combined.sort((a,b)=>a-b);next.groups=next.groups.filter(x=>x!==partner);grow(next.pieces[main],bonus);
        events.push({type:'burst',title:'업기 증폭',message:'낮은 weight 지원 '+newSupports+'개 → 주말 '+'ABCD'[main]+' weight +'+bonus});
        log(name(g)+' 업기 · 주말 '+'ABCD'[main]+' +'+bonus+' weight.',next);
      }
      let main=next.pieces[carrier(g,next)];
      const previousMax=stats(main).maxHp;main.attackFactor=next.pending.hand.attackX;main.healthFactor=next.pending.hand.healthX;sync(main,previousMax);
      const value=calculate(next.pending,next,main,g.ids.length);grow(main,value.gain);
      main.effects.push({turn:next.turn,hand:next.pending.hand.id,items:[...next.pending.items],n:value.n,m:value.m,x:value.x});
      next.record.maxGain=Math.max(next.record.maxGain,value.gain);next.record.maxN=Math.max(next.record.maxN,value.n);next.record.maxM=Math.max(next.record.maxM,value.m);next.record.maxX=Math.max(next.record.maxX,value.x);
      events.push({type:'burst',title:'N × M → weight',message:value.n+' × '+value.m+' × '+value.x.toFixed(2)+' = +'+value.gain});
      log('주말 '+'ABCD'[main.id]+' 성장 '+value.n+' × '+value.m+' × '+value.x.toFixed(2)+' = +'+value.gain+' weight.',next);
      applyTile(g,next,events);
      if(g.ids.length)main=next.pieces[carrier(g,next)];
      const boss=next.guards.find(b=>b.hp>0&&samePos(b.pos,g.pos));let battle=null;
      if(boss&&g.ids.length){
        const playerHp=g.ids.reduce((n,id)=>n+next.pieces[id].hp,0),playerMaxHp=g.ids.reduce((n,id)=>n+stats(next.pieces[id],next).maxHp,0),bossBefore=boss.hp,bossMaxHp=stats(boss,next).maxHp;
        let attack=g.ids.reduce((n,id)=>n+stats(next.pieces[id],next).attack,0);
        if(boss.gimmick==='supportResonance'&&g.ids.length>=2)attack=Math.floor(attack*1.25);
        if(boss.gimmick==='chipShield')attack=Math.max(1,attack-10);
        const hit=Math.min(boss.hp,attack);
        boss.hp-=hit;next.record.maxHit=Math.max(next.record.maxHit,hit);
        events.push({type:'strike',side:'player',title:name(g)+' 선공',message:'공격 '+attack+' → '+boss.name+' HP '+bossBefore+' → '+boss.hp});
        let counter=0;
        if(boss.hp>0){counter=stats(boss,next).attack;if((boss.gimmick==='lastStand'||boss.pickGimmick==='lastStand')&&boss.hp<=stats(boss,next).maxHp/2)counter=Math.floor(counter*1.5);if(boss.pickGimmick==='loneHunter'&&g.ids.length===1)counter=Math.floor(counter*1.25);applyDamage(g,counter,next);events.push({type:'strike',side:'boss',title:boss.name+' 반격',message:'반격 '+counter+' → 아군 HP '+playerHp+' → '+Math.max(0,playerHp-counter)});}
        else {
          next.tosses+=R.captureExtraToss;next.record.bosses++;
          const multiplier=C.bossVictoryX+risk(next)*C.bossVictoryRiskStep+(next.trait.id==='hunt'?0.5:0);
          const bonus=Math.floor(main.weight*(multiplier-1));grow(main,bonus);
          events.push({type:'burst',title:'보스 돌파 ×'+multiplier.toFixed(2),message:'주말 weight +'+bonus+' · 투척 +'+R.captureExtraToss});
          log(boss.name+' 처치 · weight ×'+multiplier.toFixed(2)+' · 추가 투척.',next);
        }
        battle={bossId:boss.id,bossName:boss.name,gimmick:boss.gimmick,pickGimmick:boss.pickGimmick,attack,hit,counter,playerMaxHp,bossMaxHp,playerHpBefore:playerHp,playerHpAfter:g.ids.reduce((n,id)=>n+next.pieces[id].hp,0),bossHpBefore:bossBefore,bossHpAfter:boss.hp,win:boss.hp===0,dead:!g.ids.length};
        log('전투 '+attack+' 선공 / '+counter+' 반격 · 보스 HP '+boss.hp+'.',next);
      }
      if(g.ids.length&&(g.pos==='G'||g.pos==='END')&&!next.guards.some(b=>b.hp>0&&b.pos==='G')){
        main=next.pieces[carrier(g,next)];
        const base=calculate(next.pending,next,main,g.ids.length),finished=calculate(next.pending,next,main,g.ids.length,g.ids.length);
        grow(main,finished.gain-base.gain);g.pos='END';
        const sum=g.ids.reduce((n,id)=>n+(next.pieces[id].settled?0:next.pieces[id].weight),0);
        for(const id of g.ids)next.pieces[id].settled=true;next.score+=sum;
        events.push({type:'settle',title:'완주 정산',message:'+'+sum+'점 · 현재 '+next.score+' / 목표 '+next.target});log(name(g)+' 완주 +'+sum+'점. 중복 정산 없음.',next);
      }
      if(next.score<next.target)masterPhase(next,events);
      const turnEnd={playerHp:g.ids.reduce((n,id)=>n+next.pieces[id].hp,0),playerMaxHp:g.ids.reduce((n,id)=>n+stats(next.pieces[id],next).maxHp,0),bossHp:battle?next.guards.find(b=>b.id===battle.bossId).hp:null,bossMaxHp:battle?stats(next.guards.find(b=>b.id===battle.bossId),next).maxHp:null,field:field(next).name};
      updateRecord(next);
      return {turnEnd,revision:s.revision,next,groupId:gid,arrival:arriving,path,value,battle,events,weightBefore:beforeWeight,weightAfter:g.ids.length?weight(g,next):0,scoreGain:next.score-beforeScore,groupName:name(source),carrier:main?.id};
    }
    function finishTurn(masterApplied=false) {
      if(!masterApplied&&s.score<s.target)masterPhase(s,[]);
      s.selected=[];s.pending=null;
      if(s.score>=s.target){
        const base=Math.round(row().baseReward*s.trait.rewardX),remaining=s.tosses*D.economy.perRemainingToss,i=interest(),overflow=s.score-s.target,bonus=Math.floor(overflow/C.overflowStep)*C.overflowCoins;
        s.reward={base,remaining,interest:i,overflow,bonus,sum:base+remaining+i+bonus};s.phase='REWARD';log('목표 달성 · 초과 '+overflow+' · 보상 수령 대기.');
      }else if(s.tosses<=0||living().length===0){s.phase='LOSE';log('런 종료. 미완주 weight는 점수로 정산하지 않습니다.');}
      else{s.phase='SELECT';drawHand();}
      touched();
    }
    function commitMove(projection) {if(s.phase!=='MOVE'||!projection||projection.revision!==s.revision)return false;const p=projection;s=p.next;s.lastTurn={turn:s.turn,hand:s.pending.hand.id,group:p.groupName,n:p.value.n,m:p.value.m,x:p.value.x,gain:p.value.gain,weightBefore:p.weightBefore,weightAfter:p.weightAfter,scoreGain:p.scoreGain,arrival:p.arrival,steps:p.path.length,events:p.events.map(e=>({type:e.type,title:e.title,message:e.message}))};finishTurn(true);return true;}
    function rollShop() {
      const choose=pool=>pool[Math.floor(random()*pool.length)];
      const third=choose(['pieceTrait','charm']);
      s.shop=[{kind:'stick',ref:choose(D.shopPool.sticks)},{kind:'deckTrait',ref:choose(D.shopPool.deckTraits)},
        {kind:third,ref:choose(third==='pieceTrait'?D.shopPool.pieceTraits:D.shopPool.charms)}].map((o,index)=>({...o,index,sold:false}));s.rerolls=0;
    }
    function claimReward() {if(s.phase!=='REWARD')return;s.coins+=s.reward.sum;s.total+=s.score;log('보상 '+s.reward.sum+'냥 1회 수령.');if(s.round===allRounds.length-1)s.phase='WIN';else{s.phase='SHOP';rollShop();}touched();}
    function nextRound() {if(s.phase!=='SHOP')return;s.round++;s.phase='TRAIT';s.trait=null;s.score=0;s.target=row().target;s.groups=[];s.pieces=[];s.guards=[];s.master=null;s.hand=[];s.draw=[];s.lastRoll=null;s.lastTurn=null;s.activeGroupId=null;offerRisks();touched();}
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
    function toggleDeck(uid) {if(s.phase!=='PREP')return;if(s.deck.includes(uid))s.deck=s.deck.filter(id=>id!==uid);else if(item(uid)&&s.deck.length<s.capacity)s.deck.push(uid);else log('출전 슬롯이 가득 찼습니다.');touched();}
    function removeItem(uid,sell=false) {if(!['SHOP','PREP'].includes(s.phase)||s.collection.length<=R.minDeckSize)return;const old=item(uid);if(!old)return;const cost=sell?0:price(D.economy.removeStickCost);if(s.coins<cost)return;s.coins+=sell?Math.floor(stickById[old.type].price*D.economy.sellRatio):-cost;s.collection=s.collection.filter(i=>i!==old);s.deck=s.deck.filter(id=>id!==uid);log(stickById[old.type].name+(sell?' 판매.':' 삭제.'));touched();}
    function upgradeStick(uid) {if(s.phase!=='SHOP')return;const i=item(uid),l=i&&D.stickUpgrade.levels.find(l=>l.level===i.level+1);if(!l||s.coins<price(l.cost))return;s.coins-=price(l.cost);if(random()<l.success){i.level++;log(stickById[i.type].name+' 강화 +'+i.level);}else {if(l.onFail!=='keep')i.level=Math.max(0,i.level-1);log('강화 실패 · 현재 +'+i.level+' (박싱은 파괴 대신 하락).');}touched();}
    function capacity() {const cost=price(C.deckCapacityCost);if(s.phase!=='SHOP'||s.capacity>=C.deckCapacityMax||s.coins<cost)return;s.coins-=cost;s.capacity++;log('출전 윷 상한 '+s.capacity+'개로 확장.');touched();}
    function upgradeDeckTrait(index) {const t=s.deckTraits[index],cost=t&&price(C.traitUpgradeCost*t.level);if(s.phase!=='SHOP'||!t||t.level>=3||s.coins<cost)return;s.coins-=cost;t.level++;log(traitById[t.id].name+' 특성 Lv.'+t.level);touched();}
    function removeDeckTrait(index) {if(!['PREP','SHOP'].includes(s.phase))return;const t=s.deckTraits[index];if(!t)return;s.deckTraits.splice(index,1);log(traitById[t.id].name+' 특성 카드 삭제.');touched();}
    function upgradePiece(id) {const p=s.templates[id],cost=p&&price(C.pieceUpgradeCost*(p.level+1));if(s.phase!=='SHOP'||!p||p.level>=6||s.coins<cost)return;s.coins-=cost;p.level++;p.baseWeight+=C.pieceUpgradeWeight;p.baseHealth+=C.pieceUpgradeHealth;p.baseAttack+=C.pieceUpgradeAttack;p.healthCoeff+=0.01;p.attackCoeff+=0.01;if(p.level%3===0)p.moveSpeed++;log('말 '+'ABCD'[id]+' 강화 Lv.'+p.level+' · 다음 라운드 적용.');touched();}
    function removePieceTrait(id,index) {if(s.phase!=='SHOP'||!s.templates[id]?.traits[index])return;s.templates[id].traits.splice(index,1);log('말 '+'ABCD'[id]+' 특성 삭제.');touched();}
    function scenario(kind) {
      reset(C.defaultSeed);chooseDeck('woodcutter');s.riskOffers=['standard','safe','rush'];chooseRisk('standard');startRound();
      const g=s.groups[0];
      if(kind==='finish'){g.pos='J';g.history=[{pos:'19',route:'outer'}];grow(s.pieces[0],s.target+C.overflowStep);}
      if(kind==='combat'){g.pos='a2';g.route='diagA';g.history=[{pos:'a1',route:'diagA'}];grow(s.pieces[0],100);}
      if(kind==='stack'){g.pos='4';g.history=[{pos:'3',route:'outer'}];const b=s.groups[1];b.pos='5';b.history=[{pos:'4',route:'outer'}];grow(s.pieces[1],400);}
      if(kind==='failure')s.tosses=1;
      log('[장면] '+kind+' · 고정 도로 확인할 수 있습니다.');touched();
    }
    function replaceState(next) {s=next;if(s.phase==='SELECT'&&!s.selected.length)s.selected=s.hand.slice(0,R.sticksPerToss);touched();}
    function reconcile() {if(['SELECT','MOVE'].includes(s.phase)&&(s.score>=s.target||!living().length||(s.phase==='SELECT'&&s.tosses<=0)))finishTurn(true);}
    reset(C.defaultSeed);
    return {get state(){return s;},rounds:allRounds,stickById,traitById,pieceTraitById,row,item,weight,boardPos,samePos,living,activeGroup,setActive,routeOptions,carrier,name,stats,field,currentPlan,sumTrait,calculate,outcomes,interest,price,bossUnits,risk,
      reset,chooseDeck,chooseRisk,startRound,select,swap,toss,plan,preview,commitMove,claimReward,nextRound,product,buy,reroll,toggleDeck,removeItem,upgradeStick,capacity,upgradeDeckTrait,removeDeckTrait,upgradePiece,removePieceTrait,scenario,replaceState,reconcile,log,touched,sync,updateRecord};
  }};
})();
