(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num=v=>Math.floor(v).toLocaleString('ko-KR'),pct=v=>(v*100).toFixed(1)+'%';
  function table(id,head,rows){const el=$(id);if(el)el.innerHTML='<tr>'+head.map(v=>'<th>'+esc(v)+'</th>').join('')+'</tr>'+rows.map(row=>'<tr>'+row.map(v=>'<td>'+esc(v)+'</td>').join('')+'</tr>').join('');}
  $('themeBtn').addEventListener('click',()=>{const root=document.documentElement,dark=root.dataset.theme?root.dataset.theme==='dark':matchMedia('(prefers-color-scheme: dark)').matches;root.dataset.theme=dark?'light':'dark';});
  function render(D){
    if(D.schemaVersion!==4||!D.boxing||!D.deckTraits||!D.riskChoices||!D.gameMaster||!D.specialTiles)throw new Error('1.4 기획 데이터가 필요합니다.');
    window.YutoBoxing.mount(D);
    const C=D.boxing,R=D.rules,engine=window.YutoCore.create(D),all=engine.rounds;
    table('tblRules',['자원','값','설명'],[
      ['말',R.piecesPerPlayer,'원형의 시작 weight·기본 HP·공격으로 매 라운드 출전'],['시작 출전 상한',R.startingDeckMax,'보유함과 출전 덱 분리. 상점 확장 가능'],['최소 출전 윷',R.minDeckSize,'매 라운드 직전 구성'],['손패',R.handSize,'출전 윷 수 이내. 투척 후 사용 윷 반환·셔플'],['한 번에 투척',R.sticksPerToss,'선택 4개'],['투척',R.tossesPerRound,'윷·모·보스 처치로 추가'],['교체',R.swapsPerRound,'선택 윷 반환·셔플·보충'],['덱/말 특성 슬롯',R.deckTraitSlots+' / '+R.pieceTraitSlots,'상점 편집'],['수문장',2,'지름길 C / 완주 관문 G 고정 + 리스크 픽의 일반 보스']]);
    const sample=[{uid:1,type:'marked',level:0},...Array.from({length:3},(_,i)=>({uid:i+2,type:'wood',level:0}))];
    engine.state.collection=sample;engine.state.trait=D.riskChoices.find(t=>t.id==='standard');
    const baseline=engine.outcomes(sample.map(i=>i.uid));
    table('tblHands',['결과','이동','N','M','윷 공격 배율','윷 HP 배율','기본 확률(나무3+표시1)'],D.hands.map(h=>[h.name,h.move,h.chips,h.mult,'×'+h.attackX,'×'+h.healthX,pct(baseline.rows.find(v=>v.hand.id===h.id).p)]));
    const xy=id=>{const n=D.board.nodes.find(n=>n.id===(id==='END'?'0':id));return [36+n.x*64,36+n.y*64];};
    let svg='<svg viewBox="0 0 410 450" role="img" aria-label="전통 윷판과 완주 관문 G">';
    for(const route of Object.values(D.board.routes))svg+='<polyline points="'+route.map(id=>xy(id).join(',')).join(' ')+'" fill="none" stroke="var(--line)" stroke-width="2"/>';
    for(const n of D.board.nodes){const [x,y]=xy(n.id);svg+='<circle cx="'+x+'" cy="'+y+'" r="'+(n.tag?12:8)+'" fill="var(--surface)" stroke="'+(['C','G'].includes(n.id)?'var(--red)':'var(--ink-2)')+'"/><text x="'+x+'" y="'+(y+23)+'" font-size="10" text-anchor="middle" fill="var(--ink)">'+esc(n.id==='G'?'관문 G':n.id)+'</text>';}
    $('boardSvg').innerHTML=svg+'</svg>';
    table('tblPathCases',['시작','결과','도착과 전투'],[['5','도','a1 · 교전 없음'],['5','걸','C · 지름길 보스 교전'],['a1','걸','a3 · C는 경유이므로 교전 없음'],['C · 생존 보스','도/개 등','현재 칸에서 재공격'],['19','도','G · 관문 보스 교전 → 처치 시 END'],['C · 보스 처치됨','걸','G → 관문 전투'],['1','빽도','출발 대기']]);
    table('tblEvents',['사건','효과'],[['윷 효과','N·M·×M과 HP/공격 배율 귀속'],['업기','최고 weight 주말 증폭, 이후 투척 지원 배율'],['보스 처치','주말 weight ×처치 배율 + 추가 투척'],['HP 0','말 사망, 미정산 weight 0'],['완주','완주 보너스 적용 후 weight 합계 1회 정산']]);
    $('scoreExample').innerHTML='<p>시작 weight 100에 <b>N 100 × M 3 × X 2 = 600</b>을 더하면 weight 700이다. 기본 HP 40·HP 계수 0.25·윷 HP ×1.25이면 최대 HP는 <b>268</b>이다. 기본 공격 8·공격 계수 0.18·윷 공격 ×1.4이면 공격은 <b>187</b>이다.</p><p>이후 weight 100인 말이 합류하고 지원 계수가 0.5면 주말에 350 weight를 더한다. 묶음 weight는 1,150이 되고 HP·공격은 각 식으로 다시 계산한다. 미완주 상태의 정산 점수는 여전히 변하지 않는다. 실제 초깃값 변경과 구분한 수식 설명용 예시다.</p>';
    const init=['marked','wood','wood','wood'];
    $('calcSlots').innerHTML=init.map((id,i)=>'<div class="slot"><span>'+(i+1)+'</span><select data-stick="'+i+'">'+D.sticks.map(s=>'<option value="'+s.id+'"'+(s.id===id?' selected':'')+'>'+esc(s.name)+'</option>').join('')+'</select><input data-level="'+i+'" type="number" min="0" max="10" value="0" aria-label="윷 '+(i+1)+' 강화 단계"></div>').join('');
    function recalc(){const picks=[...$('calcSlots').querySelectorAll('[data-stick]')].map((el,i)=>({uid:i+1,type:el.value,level:Math.max(0,Math.min(10,Math.floor(+$('calcSlots').querySelector('[data-level="'+i+'"]').value||0)))}));engine.state.collection=picks;const e=engine.outcomes(picks.map(i=>i.uid));$('calcEv').textContent=num(e.ev);$('calcRound').textContent=num(e.min)+'~'+num(e.max);$('calcExtra').textContent=pct(e.rows.filter(v=>['yut','mo'].includes(v.hand.id)).reduce((n,v)=>n+v.p,0));$('calcSynergy').textContent='게임과 동일한 N·M·재질 계산. 말·업기·보스·메타 특성은 제외.';table('calcTable',['결과','확률','기대 증가(해당 결과 조건)'],e.rows.map(v=>[v.hand.name,pct(v.p),v.p?num(v.gain/v.p):'—']));}
    $('calcSlots').oninput=recalc;recalc();
    table('tblSticks',['윷','재질','가격','배 확률','N','+M','×M','효과'],D.sticks.map(s=>[s.name,s.family,s.price,pct(s.pFlat),s.chips,s.addMult,s.xMult,s.effect]));
    table('tblFamilies',['재질','시너지'],D.families.map(f=>[f.name,f.summary]));
    table('tblCharms',['부적','가격','효과','박싱 제공'],D.charms.map(c=>[c.name,c.price,c.effect,D.shopPool.charms.includes(c.id)?'제공':'후속']));
    table('tblBuildTraits',['구분','카드','가격','효과'],[...D.deckTraits.map(t=>['덱',t.name,t.price,t.effect]),...D.pieceTraits.map(t=>['말',t.name,t.price,t.effect])]);
    table('tblTraits',['선택지','위험도','목표 배수','보상 배수','효과'],D.riskChoices.map(t=>[t.name,t.risk,t.targetX,t.rewardX,t.effect+' / 보스 기믹 '+t.bossGimmick]));
    table('tblMasterTraits',['부류','이름','효과'],[...D.roundTraits.map(t=>['판 전체',t.name,t.effect]),...D.specialTiles.map(t=>['특수칸',t.name,t.effect])]);
    table('tblGuardians',['보스','기본 weight','HP 배율','공격 배율','효과'],D.guardians.map(b=>[b.name,b.weight,b.healthX,b.attackX,b.effect]));
    table('tblDecks',['덱','출전 구성','엽전','효과 카드'],D.starterDecks.map(d=>[d.name,Object.entries(d.sticks).map(([id,n])=>engine.stickById[id].name+' '+n).join(' / '),d.coins,engine.traitById[d.trait].name]));
    table('tblRounds',['라운드','유형','기본 목표','보스 배치','보스 성장 계수','기본 보상'],all.map(r=>[r.id,{normal:'일반',elite:'엘리트',boss:'막 보스'}[r.type],num(r.target),r.bosses.map(b=>D.guardians.find(g=>g.id===b.id).name+' / '+b.post).join(', ')+' + 일반 '+r.extraBosses+' + 픽 추가',r.bossScale,r.baseReward]));
    const max=Math.max(...all.map(r=>r.target)),w=850,h=230,bottom=195,bw=75;
    $('targetChart').innerHTML='<svg viewBox="0 0 '+w+' '+h+'" role="img" aria-label="9라운드 기본 목표">'+all.map((r,i)=>{const bh=Math.sqrt(r.target/max)*150,x=45+i*85;return '<rect x="'+x+'" y="'+(bottom-bh)+'" width="'+bw+'" height="'+bh+'" fill="'+(r.type==='boss'?'var(--red)':'var(--blue)')+'"/><text x="'+(x+bw/2)+'" y="'+(bottom-bh-6)+'" text-anchor="middle" font-size="12" fill="var(--ink)">'+num(r.target)+'</text><text x="'+(x+bw/2)+'" y="215" text-anchor="middle" font-size="12" fill="var(--ink)">'+r.id+'</text>';}).join('')+'</svg>';
    table('tblEconomy',['항목','규칙'],[['시작 출전 상한',R.startingDeckMax+'개'],['이자',D.economy.interestPer+'냥당 1냥, 상한 '+D.economy.interestCap+' + 특성'],['기본 재진열',D.economy.rerollBase+'냥, 누를 때마다 +'+D.economy.rerollStep],['출전 상한 +1',C.deckCapacityCost+'냥'],['말 강화',C.pieceUpgradeCost+' × (현재 레벨+1)냥'],['덱 특성 강화',C.traitUpgradeCost+' × 현재 레벨 냥'],['초과 보너스',C.overflowStep+'점당 '+C.overflowCoins+'냥']]);
    table('tblShopOdds',['칸','추첨 방식'],[['윷 1칸','허용 윷 '+D.shopPool.sticks.length+'종 중 균등'],['덱 특성 1칸','특성 '+D.deckTraits.length+'종 중 균등'],['말 특성/부적 1칸','종류 각각 50%, 해당 풀 내 균등']]);
    table('tblUpgrade',['도전','비용','성공','박싱 실패'],D.stickUpgrade.levels.map(l=>['+'+l.level,l.cost,pct(l.success),l.onFail==='keep'?'유지':'1단계 하락']));
  }
  function fail(error){$('loader').classList.add('show');const root=$('boxingGame');if(root)root.innerHTML='<p class="note">데이터를 읽지 못했습니다. 문서 상단에서 1.4 game-data.json을 선택하세요. '+esc(error?.message||'')+'</p>';}
  $('jsonFile').addEventListener('change',async e=>{if(!e.target.files[0])return;try{render(JSON.parse((await e.target.files[0].text()).replace(/^\uFEFF/,'')));$('loader').classList.remove('show');}catch(error){fail(error);}});
  fetch('game-data.json',{cache:'no-cache'}).then(r=>r.ok?r.json():Promise.reject()).then(render).catch(()=>{try{render(JSON.parse($('embeddedGameData').textContent));}catch(error){fail(error);}});
})();
