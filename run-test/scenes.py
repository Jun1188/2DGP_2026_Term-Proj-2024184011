"""Deterministic scene setup, shared by the visual runner and diagnostics."""
from engine import Game


def catalog(data):
    rows = [('play', '실제 런 · 난수'), ('stack', '업기 · 갈림길'), ('combat', '지름길 수문장'), ('finish', '완주 수문장 · 정산'), ('failure', '투척 소진'), ('reward', '라운드 보상'), ('choice', '상점 / 추가 이자'), ('shop', '상점 · 덱 · 강화'), ('normal:gain', '일반 칸 +10'), ('normal:loss', '일반 칸 -5')]
    rows += [('boss:' + key, label) for key, label in [('outside', '시야 밖 대기'), ('detect', '3칸 이내 발견'), ('track', '시야 밖 지속 추적'), ('combat', '보스 접근 · 선공 · 반격')]]
    rows += [('boss:' + b['id'], b['name'] + ' 전투') for b in data['guardians'] if b['kind'] == 'boss']
    rows += [('tile:' + t['id'], '특수칸 · ' + t['name']) for t in data['specialTiles']]
    rows += [('field:' + t['id'], '판 전체 · ' + t['name']) for t in data['roundTraits']]
    rounds = [r for a in data['run']['acts'] for r in a['rounds']]
    rows += [('round:' + str(i), r['id'] + (' · 빅 라운드' if r['type'] == 'boss' else ' · 일반 크기')) for i, r in enumerate(rounds)]
    rows += [('hand:' + h['id'], '윷 결과 · ' + h['name']) for h in data['hands']]
    rows += [('risk:' + r['id'], '리스크 · ' + r['name']) for r in data['riskChoices']]
    rows += [('starter:' + d['id'], '시작 덱 · ' + d['name']) for d in data['starterDecks']]
    names = {x['id']: x['name'] for key in ('sticks', 'deckTraits', 'pieceTraits', 'charms') for x in data[key]}
    for key, kind in [('sticks', 'stick'), ('deckTraits', 'deckTrait'), ('pieceTraits', 'pieceTrait'), ('charms', 'charm')]:
        rows += [('product:' + kind + ':' + ref, '상점 상품 · ' + names[ref]) for ref in data['shopPool'][key]]
    return rows


def load_scene(game: Game, key='stack', seed=None):
    if key not in dict(catalog(game.data)): raise ValueError('알 수 없는 장면: ' + key)
    parts = key.split(':'); category = parts[0]; value = parts[1] if len(parts) > 1 else ''
    index = int(value) if category == 'round' else 1 if category == 'boss' else 3 if category == 'field' else 0
    game.start(seed=seed, round_index=index, risk=value if category == 'risk' else 'standard', starter=value if category == 'starter' else 'woodcutter')
    s = game.state; g = s['groups'][0]
    s['scene'] = key; s['forced'] = None if key == 'play' else value if category == 'hand' else 'do'
    if key == 'stack': game.place(g, '4'); game.place(s['groups'][1], '5'); game.grow(s['pieces'][1], 400)
    if key == 'combat': game.place(g, 'a2', 'diagA'); game.grow(s['pieces'][0], 100)
    if key == 'finish':
        game.place(g, 'J'); gate = next(b for b in s['guards'] if b['role'] == 'gate')
        game.grow(s['pieces'][0], max(s['target'] + game.config['overflowStep'], int(game.stats(gate)['maxHp'] / (game.config['pieceAttackWeightCoeff'] * game.config['gateDamageX'])) * 2 + 100))
    if key == 'failure': s['tosses'] = 1
    if category == 'normal': game.place(g, '3' if value == 'loss' else '1')
    if category == 'tile':
        game.place(g, '4'); s['pieces'][0]['hp'] = max(1, s['pieces'][0]['hp'] - 30)
        s['master']['plans'] = [dict(tiles=[dict(pos='5', type=value)], roundTraitId='calm') for _ in s['master']['plans']]
    if category == 'field':
        game.place(g, '4')
        for plan in s['master']['plans']: plan['roundTraitId'] = value
    if category == 'hand':
        game.place(g, '4')
        marked = next((uid for uid in s['draw'] if game.sticks[game.item(uid)['type']].get('marked')), None)
        if marked is not None: s['draw'].remove(marked); s['draw'].append(marked)
    if category == 'boss':
        boss = next(b for b in s['guards'] if b['role'] == 'extra')
        definition = next((b for b in game.data['guardians'] if b['id'] == value and b['kind'] == 'boss'), None)
        if definition:
            old = next(b for b in game.data['guardians'] if b['id'] == boss['kind'])
            boss['healthFactor'] *= definition['healthX'] / old['healthX']; boss['attackFactor'] *= definition['attackX'] / old['attackX']
            boss.update(kind=value, name=definition['name'], gimmick=definition['gimmick'], weight=int(definition['weight'] * game.row['bossScale'] + .5)); boss['hp'] = game.stats(boss)['maxHp']
        s['master']['plans'] = [dict(tiles=[], roundTraitId='calm') for _ in s['master']['plans']]
        game.place(g, '1' if value in ('outside', 'track', 'detect') else '2')
        boss.update(pos='10' if value in ('outside', 'track') else '5' if value == 'detect' else '4', history=[] if value in ('outside', 'track', 'detect') else ['3'], targetPieceId=0 if value == 'track' else None)
        s['pieces'][0]['healthScale'] = 6; s['pieces'][0]['hp'] = game.stats(s['pieces'][0])['maxHp']
    if key in ('reward', 'choice', 'shop') or category == 'product':
        s['score'] = s['target'] + game.config['overflowStep']; game.finish_turn()
        if key != 'reward': game.claim_reward()
        if key == 'shop' or category == 'product': game.enter_shop()
        s['coins'] = 100
        if category == 'product':
            s['shop'][0] = dict(kind=value, ref=parts[2], sold=False)
            if value == 'deckTrait': s['deck_traits'] = [t for t in s['deck_traits'] if t['id'] != parts[2]]
    s['feedback'] = []; game.touch()
    return game
