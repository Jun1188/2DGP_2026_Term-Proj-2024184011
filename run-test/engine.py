"""Pure Python rules. Importing this module does not open pico2d or SDL."""
from __future__ import annotations
from copy import deepcopy
from collections import deque
from pathlib import Path
import json
import math

ROOT = Path(__file__).resolve().parent

def load_data():
    return json.loads((ROOT / 'game-data.json').read_text(encoding='utf-8-sig'))

class Game:
    def __init__(self, data=None, seed=20261109):
        self.data = data if data is not None else load_data()
        self.rules, self.config = self.data['rules'], self.data['boxing']
        self.rounds = [dict(r, act=a['act']) for a in self.data['run']['acts'] for r in a['rounds']]
        self.sticks = {x['id']: x for x in self.data['sticks']}
        self.hands = {x['id']: x for x in self.data['hands']}
        self.traits = {x['id']: x for x in self.data['deckTraits']}
        self.piece_traits = {x['id']: x for x in self.data['pieceTraits']}
        self.reset(seed)

    def reset(self, seed):
        self.state = dict(seed=seed & 0xffffffff, rng=seed & 0xffffffff, revision=0,
            round=0, phase='DRAW', turn=0, score=0, total=0, coins=0, pieces=[], groups=[], guards=[],
            collection=[], deck=[], hand=[], draw=[], selected=[], pending=None, last_roll=None,
            feedback=[], enemies=[], events=[], log=[], master=None, deck_traits=[], charms=[],
            templates=[], reward=None, shop=[], rerolls=0, active=0, serial=0, last_draw=[])

    @property
    def row(self): return self.rounds[self.state['round']]

    @property
    def board(self): return self.data['bigBoard' if self.row['type'] == 'boss' else 'board']

    def random(self):
        s = self.state
        s['rng'] = (s['rng'] * 1664525 + 1013904223) & 0xffffffff
        return s['rng'] / 4294967296

    def shuffle(self, values):
        values = list(values)
        for i in range(len(values) - 1, 0, -1):
            j = int(self.random() * (i + 1))
            values[i], values[j] = values[j], values[i]
        return values

    def touch(self): self.state['revision'] += 1
    def log(self, message): self.state['log'].append(message)
    def change(self, source, delta, label=''): self.state['feedback'].append(dict(source=source, delta=delta, label=label))
    def sum_trait(self, key): return sum(self.traits[t['id']].get(key, 0) * t['level'] for t in self.state['deck_traits'])

    def plan_now(self):
        m = self.state['master']
        return m['plans'][m['index']] if m else dict(tiles=[], roundTraitId='calm')

    def field(self): return next(t for t in self.data['roundTraits'] if t['id'] == self.plan_now()['roundTraitId'])
    def factor(self, p, key): return math.prod(self.piece_traits[t].get(key, 1) for t in p['traits'])

    def stats(self, p):
        hp = (p['baseHealth'] + p['weight'] * p['healthCoeff']) * p.get('healthScale', 1) * p['healthFactor'] * self.factor(p, 'healthX')
        atk = (p['baseAttack'] + p['weight'] * p['attackCoeff']) * p.get('attackScale', 1) * p['attackFactor'] * self.factor(p, 'attackX') * self.field()['attackX']
        return dict(maxHp=max(1, math.floor(hp)), attack=max(1, math.floor(atk)))

    def grow(self, p, amount, old_max=None):
        old_max = self.stats(p)['maxHp'] if old_max is None else old_max
        p['weight'] = min(self.config['maxWeight'], max(0, p['weight'] + math.floor(amount)))
        p['hp'] = 0 if p['hp'] <= 0 else min(self.stats(p)['maxHp'], max(0, p['hp'] + self.stats(p)['maxHp'] - old_max))

    def edit_unit(self, unit, **changes):
        allowed = {'weight', 'baseHealth', 'baseAttack', 'healthScale', 'attackScale', 'visionRange'}
        if not changes.keys() <= allowed or any(not isinstance(v, (int, float)) or not math.isfinite(v) for v in changes.values()):
            raise ValueError('유효한 수치만 편집할 수 있습니다.')
        for key, value in changes.items():
            low, high = (0, 30) if key == 'visionRange' else (.1, 10) if key.endswith('Scale') else (0, self.config['maxWeight'])
            if not low <= value <= high or (key == 'visionRange' and value != int(value)): raise ValueError('수치 범위를 확인하세요.')
        old = self.stats(unit)['maxHp']; unit.update(changes); self.grow(unit, 0, old)
        if 'dead' in unit: self.cleanup()
        self.touch()

    def living(self): return [g for g in self.state['groups'] if g['ids'] and g['pos'] != 'END']
    def active(self): return next((g for g in self.living() if g['id'] == self.state['active']), next(iter(self.living()), None))
    def weight(self, group): return sum(self.state['pieces'][i]['weight'] for i in group['ids'])
    def carrier(self, group): return min(group['ids'], key=lambda i: (-self.state['pieces'][i]['weight'], i))
    @staticmethod
    def name(group): return '+'.join('ABCD'[i] for i in group['ids'])
    @staticmethod
    def physical(pos): return '0' if pos == 'J' else pos
    def same(self, a, b): return a is not None and b is not None and self.physical(a) == self.physical(b)
    def item(self, uid): return next(i for i in self.state['collection'] if i['uid'] == uid)

    def add_item(self, kind):
        self.state['serial'] += 1
        uid = self.state['serial']; self.state['collection'].append(dict(uid=uid, type=kind, level=0))
        return uid

    def start(self, seed=None, round_index=0, risk='standard', starter='woodcutter'):
        self.reset(self.state['seed'] if seed is None else seed)
        s, c = self.state, self.config; s['round'] = round_index
        deck = next(d for d in self.data['starterDecks'] if d['id'] == starter)
        s['coins'], s['capacity'] = deck['coins'], self.rules['startingDeckMax']
        s['deck_traits'] = [dict(id=deck['trait'], level=1)]
        for kind, count in deck['sticks'].items():
            for _ in range(count): s['deck'].append(self.add_item(kind))
        s['templates'] = [dict(id=i, level=0, baseWeight=c['pieceBaseWeight'], baseHealth=c['pieceBaseHealth'], baseAttack=c['pieceBaseAttack'], healthCoeff=c['pieceHealthWeightCoeff'], attackCoeff=c['pieceAttackWeightCoeff'], healthScale=1, attackScale=1, moveSpeed=c['pieceMoveSpeed'], traits=[]) for i in range(4)]
        self.set_risk(risk); self.start_round()

    def set_risk(self, key):
        self.state['risk'] = deepcopy(next(t for t in self.data['riskChoices'] if t['id'] == key))
        self.state['target'] = math.floor(self.row['target'] * self.state['risk']['targetX'] + .5)
        self.state['phase'] = 'PREP'; self.touch()

    def start_round(self):
        s, c = self.state, self.config
        if not self.rules['minDeckSize'] <= len(s['deck']) <= s['capacity']: raise ValueError('출전 덱 개수를 확인하세요.')
        delta = sum(self.traits[t['id']].get('tossDelta', 0) for t in s['deck_traits'])
        s.update(phase='DRAW', turn=0, score=0, pending=None, selected=[], hand=[], active=0,
            feedback=[], enemies=[], events=[], last_draw=[], last_roll=None, reward=None,
            tosses=max(1, self.rules['tossesPerRound'] + delta + ('lucky' in s['charms']) - (3 if s['risk']['id'] == 'lastStand' else 0)),
            swaps=0 if s['risk']['id'] == 'lastStand' else self.rules['swapsPerRound'], master=None)
        s['draw'] = self.shuffle(s['deck']); s['pieces'] = []
        for t in s['templates']:
            p = dict(deepcopy(t), weight=t['baseWeight'] + self.sum_trait('initialWeight'), healthFactor=1, attackFactor=1, hp=1, dead=False, settled=False, moveBonus=0)
            p['hp'] = self.stats(p)['maxHp']; s['pieces'].append(p)
        s['groups'] = [dict(id=i, ids=[i], pos=None, route='outer', history=[]) for i in range(4)]
        placements = list(self.row['bosses'])
        count = 0 if s['round'] == 0 else min(len(self.row['extraBossPosts']), self.row['extraBosses'] + s['risk']['extraBosses'])
        placements += [dict(role='extra', id=self.row['extraBossKinds'][i % len(self.row['extraBossKinds'])], post=self.row['extraBossPosts'][i]) for i in range(count)]
        s['guards'] = []; risk = self.row['baseRisk'] + s['risk']['risk']; calm = .9 if s['risk']['bossGimmick'] == 'calm' else 1
        for i, placement in enumerate(placements):
            b = next(b for b in self.data['guardians'] if b['id'] == placement['id'])
            unit = dict(id='boss-' + str(i), kind=b['id'], role=placement['role'], name=b['name'], gimmick=b['gimmick'], pickGimmick=s['risk']['bossGimmick'], pos=placement['post'], weight=math.floor(b['weight'] * self.row['bossScale'] + .5), baseHealth=c['bossBaseHealth'], baseAttack=c['bossBaseAttack'], healthCoeff=c['bossHealthWeightCoeff'], attackCoeff=c['bossAttackWeightCoeff'], healthScale=1, attackScale=1, healthFactor=b['healthX'] * (1 + risk * c['riskHealthStep']) * calm, attackFactor=b['attackX'] * (1 + risk * c['riskAttackStep']) * calm, hp=1, traits=[], visionRange=self.rules['guardianCombat']['visionRange'], targetPieceId=None, history=[], lastRoll=None)
            unit['hp'] = self.stats(unit)['maxHp']; s['guards'].append(unit)
        candidates = [n['id'] for n in self.board['nodes'] if n['id'] not in {'0', 'J', 'C', 'G', 'END'} and not any(b['pos'] == n['id'] for b in s['guards'])]
        plans = []
        for index in range(self.data['gameMaster']['planCount']):
            positions = ['5', '7'] if index == 0 and s['round'] == 0 else self.shuffle(candidates)[:self.row['tileCount']]
            tiles = []
            for j, pos in enumerate(positions):
                kind = ('fortune' if j == 0 else 'well') if s['round'] == 0 else ('fortune' if index == 0 and j == 0 else self.row['tileKinds'][int(self.random() * len(self.row['tileKinds']))])
                tiles.append(dict(pos=pos, type=kind))
            fields = [t for t in self.data['roundTraits'] if t['id'] in self.row['fieldTraits']]
            field = 'calm' if s['round'] == 0 else fields[int(self.random() * len(fields))]['id']
            plans.append(dict(tiles=tiles, roundTraitId=field))
        s['master'] = dict(index=0, cycle=self.data['gameMaster']['cycleTurns'], plans=plans)
        self.touch(); self.log(self.row['id'] + ' 출전')

    def draw_hand(self):
        s = self.state
        if s['phase'] != 'DRAW': return
        target = min(len(s['deck']), 4 if s['risk']['id'] == 'tightHand' else self.rules['handSize'])
        s['selected'], s['last_draw'] = [], []
        while len(s['hand']) < target and s['draw']:
            uid = s['draw'].pop(); s['hand'].append(uid); s['last_draw'].append(uid)
        s['phase'] = 'REVEAL'; self.touch()

    def reveal_hand(self):
        if self.state['phase'] == 'REVEAL': self.state['phase'] = 'SELECT'; self.touch()

    def select(self, uid):
        s = self.state
        if s['phase'] != 'SELECT' or uid not in s['hand']: return
        if uid in s['selected']: s['selected'].remove(uid)
        elif len(s['selected']) < 4: s['selected'].append(uid)
        self.touch()

    def swap(self):
        s = self.state
        if s['phase'] != 'SELECT' or not s['selected'] or s['swaps'] <= 0: return
        out = list(s['selected']); s['hand'] = [i for i in s['hand'] if i not in out]
        s['draw'] = self.shuffle(s['draw'] + out); s.update(selected=[], phase='DRAW', swaps=s['swaps'] - 1); self.touch()

    def hand_for(self, items, faces):
        count = faces.count('flat')
        back = count == 1 and self.sticks[self.item(items[faces.index('flat')])['type']].get('marked', False)
        return self.hands['backdo'] if back else next(h for h in self.hands.values() if h['flats'] == count and not h.get('markedOnly'))

    def calculate(self, pending, piece=None, size=1, finish=0):
        s = self.state; h = pending['hand']
        n = h['chips'] + finish * (self.rules['finishChipsPerPiece'] + (100 if 'tortoise' in s['charms'] else 0)) * (2 if s['risk']['id'] == 'rush' else 1)
        m, x = h['mult'] + self.sum_trait('addMultPerLevel'), 1
        for uid, face in zip(pending['items'], pending['faces']):
            item = self.item(uid); stick = self.sticks[item['type']]
            for level in self.data['stickUpgrade']['levels']:
                if level['level'] <= item['level']:
                    n += level['bonus'].get('chips', 0); m += level['bonus'].get('addMult', 0); x *= level['bonus'].get('xMult', 1)
            if stick['trigger'] in ('always', face): n += stick['chips']; m += stick['addMult']; x *= stick['xMult']
        for family in self.data['families']:
            count = sum(self.sticks[self.item(uid)['type']]['family'] == family['id'] for uid in pending['items'])
            tiers = [int(k) for k in family['bonus'] if int(k) <= count]
            if tiers:
                bonus = family['bonus'][str(max(tiers))]
                n += bonus.get('chips', 0); m += bonus.get('addMult', 0); x *= bonus.get('xMult', 1)
        if h['id'] == 'backdo': m += 4
        if 'magpie' in s['charms'] and h['id'] == 'gae': m += 3
        if s['risk']['id'] == 'feast': m += 2
        if s['risk']['id'] == 'backdoFest' and h['id'] == 'backdo': n *= 5
        if s['risk']['id'] == 'allOrNothing':
            if h['id'] in ('gae', 'geol'): n = 0
            elif h['id'] != 'backdo': x *= 2
        x *= 1 + self.sum_trait('growthPerLevel')
        if h['id'] in self.rules['extraTossOn']: x *= 1 + self.sum_trait('bigHandXPerLevel')
        x *= (1 + (self.rules['scoring']['stackSupportBonus'] + self.sum_trait('supportPerLevel') + (.25 if s['risk']['id'] == 'piggyback' else 0)) * (size - 1)) * (self.factor(piece, 'growthX') if piece else 1)
        return dict(n=n, m=m, x=x, gain=min(self.config['maxWeight'], math.floor(n * m * x)))

    def toss(self, forced=None):
        s = self.state
        if s['phase'] != 'SELECT' or len(s['selected']) != 4 or s['tosses'] <= 0: return False
        items = list(s['selected'])
        if forced == 'backdo' and not any(self.sticks[self.item(uid)['type']].get('marked') for uid in items): raise ValueError('빽도 고정에는 표시 윷이 필요합니다.')
        faces = ['flat' if self.random() < self.sticks[self.item(uid)['type']]['pFlat'] else 'back' for uid in items]
        if forced:
            faces = ['back'] * 4
            if forced == 'backdo': faces[next(i for i, uid in enumerate(items) if self.sticks[self.item(uid)['type']].get('marked'))] = 'flat'
            else:
                order = sorted(range(4), key=lambda i: bool(self.sticks[self.item(items[i])['type']].get('marked')))
                for i in order[:self.hands[forced]['flats']]: faces[i] = 'flat'
        hand = self.hand_for(items, faces)
        s.update(turn=s['turn'] + 1, tosses=s['tosses'] - 1, selected=[], feedback=[], enemies=[], events=[], last_draw=[])
        s['pending'] = dict(items=items, faces=faces, hand=hand, route=None); s['last_roll'] = hand['id']
        s['hand'] = [i for i in s['hand'] if i not in items]; s['draw'] = self.shuffle(s['draw'] + items)
        fall = s['risk']['id'] == 'fall' and self.random() < .1
        if not fall and hand['id'] in self.rules['extraTossOn']: s['tosses'] += 1
        can_back = lambda g: g is not None and g['pos'] is not None and bool(g['history'])
        if hand['move'] < 0 and not can_back(self.active()):
            fallback = sorted(filter(can_back, self.living()), key=lambda g: (-self.weight(g), g['id']))
            if fallback: s['active'] = fallback[0]['id']
        if fall or (hand['move'] < 0 and not any(can_back(g) for g in self.living())):
            self.change('윷가락', 0, '낙 / 이동할 말 없음'); self.finish_turn()
        else: s['phase'] = 'MOVE'
        self.touch(); return True

    def route_options(self, group=None):
        g = group or self.active()
        if g is None: return []
        ids = ['outer' if g['pos'] in ('5', '10') else g['route']]
        branch = self.board['branchOnStop'].get(g['pos'])
        if self.state['pending'] and self.state['pending']['hand']['move'] >= 0 and branch and self.state['risk']['id'] != 'shortcut' and not self.boss_at(g['pos']): ids.append(branch)
        seen, out = set(), []
        for key in ids:
            path = self.board['routes'][key]
            if g['pos'] is not None and g['pos'] not in path: continue
            index = 0 if g['pos'] is None else path.index(g['pos']); suffix = tuple(path[index:])
            if suffix not in seen: out.append(key); seen.add(suffix)
        return out

    def boss_at(self, pos): return next((b for b in self.state['guards'] if b['hp'] > 0 and self.same(b['pos'], pos)), None)

    def movement(self, g, route=None):
        if self.boss_at(g['pos']): return []
        h = self.state['pending']['hand']
        if h['move'] < 0: return [deepcopy(g['history'][-1])] if g['history'] else []
        p = self.state['pieces'][self.carrier(g)]
        count = max(1, h['move'] + p['moveSpeed'] - 1 + p['moveBonus'] + self.field()['speedBonus'])
        options = self.route_options(g); route = route if route in options else options[0]
        path = self.board['routes'][route]; index = path.index(g['pos'] or '0'); out = []
        for pos in path[index + 1:index + 1 + count]:
            out.append(dict(pos=pos, route=route))
            if pos in ('G', 'END'): break
        return out

    def board_path(self, start, target, blocked=()):
        start, target = self.physical(start), self.physical(target); edges = {}
        for route in self.board['routes'].values():
            for a, b in zip(route, route[1:]):
                a, b = self.physical(a), self.physical(b)
                if 'END' in (a, b) or a == b: continue
                edges.setdefault(a, []); edges.setdefault(b, [])
                if b not in edges[a]: edges[a].append(b)
                if a not in edges[b]: edges[b].append(a)
        queue, seen = deque([[start]]), {start}
        while queue:
            path = queue.popleft()
            if path[-1] == target: return path
            for pos in edges.get(path[-1], []):
                if pos not in seen and pos not in blocked: seen.add(pos); queue.append(path + [pos])
        return None

    def cleanup(self):
        s = self.state
        for p in s['pieces']:
            if not p['settled'] and (p['hp'] <= 0 or p['weight'] <= 0): p.update(hp=0, weight=0, dead=True)
        for g in s['groups']: g['ids'] = [i for i in g['ids'] if not s['pieces'][i]['dead']]
        s['groups'] = [g for g in s['groups'] if g['ids']]

    def damage(self, group, amount):
        for i in sorted(group['ids'], key=lambda i: (self.state['pieces'][i]['weight'], i)):
            p = self.state['pieces'][i]; hit = min(p['hp'], amount); p['hp'] -= hit; amount -= hit
            if amount <= 0: break
        self.cleanup()

    def apply_tile(self, group):
        if not group['ids']: return
        s = self.state
        tile = next((t for t in self.plan_now()['tiles'] if self.same(t['pos'], group['pos'])), None)
        p = s['pieces'][self.carrier(group)]; before = p['weight']
        if tile:
            effect = next(t for t in self.data['specialTiles'] if t['id'] == tile['type']); source, label = '특수칸', effect['name']
        else:
            if group['pos'] in (None, '0', 'J', 'C', 'G', 'END') or self.boss_at(group['pos']): return
            conf = self.data['normalTiles']; effect = dict(weight=conf['loss'] if group['pos'] in conf['lossNodes'] else conf['gain']); source, label = '일반 칸', str(group['pos'])
        self.grow(p, effect.get('weight', 0))
        p['hp'] = max(0, min(self.stats(p)['maxHp'], p['hp'] + effect.get('heal', 0) - effect.get('damage', 0)))
        p['moveBonus'] = min(3, p['moveBonus'] + effect.get('speed', 0)); self.cleanup()
        self.change(source, p['weight'] - before, label); self.log(source + ' ' + label)

    def fight(self, group, boss, boss_first=False):
        s, c = self.state, self.config
        before_w, before_hp, before_b = self.weight(group), sum(s['pieces'][i]['hp'] for i in group['ids']), boss['hp']
        group_name, events = self.name(group), []
        def player_strike():
            if not group['ids'] or boss['hp'] <= 0: return
            attack = sum(self.stats(s['pieces'][i])['attack'] for i in group['ids'])
            if boss['gimmick'] == 'supportResonance': attack = max(1, math.floor(attack * (1.25 if len(group['ids']) >= 2 else c['shortcutSoloDamageX'])))
            if boss['gimmick'] == 'gateArmor': attack = max(1, math.floor(attack * c['gateDamageX']))
            if boss['gimmick'] == 'chipShield': attack = max(1, attack - 10)
            hit = min(boss['hp'], attack); boss['hp'] -= hit; events.append(dict(side='player', damage=hit))
        def boss_strike():
            if not group['ids'] or boss['hp'] <= 0: return
            damage = self.stats(boss)['attack']
            if (boss['gimmick'] in ('lastStand', 'gateArmor') or boss['pickGimmick'] == 'lastStand') and boss['hp'] <= self.stats(boss)['maxHp'] / 2: damage = math.floor(damage * 1.5)
            if boss['pickGimmick'] == 'loneHunter' and len(group['ids']) == 1: damage = math.floor(damage * 1.25)
            self.damage(group, damage); events.append(dict(side='boss', damage=damage))
        for action in ([boss_strike, player_strike] if boss_first else [player_strike, boss_strike]): action()
        if boss['hp'] == 0 and group['ids']:
            s['tosses'] += self.rules['captureExtraToss']; p = s['pieces'][self.carrier(group)]
            multiplier = c['bossVictoryX'] + (self.row['baseRisk'] + s['risk']['risk']) * c['bossVictoryRiskStep'] + (.5 if s['risk']['id'] == 'hunt' else 0)
            self.grow(p, math.floor(p['weight'] * (multiplier - 1)))
        delta = self.weight(group) - before_w
        if delta: self.change('전투', delta, boss['name'])
        result = dict(group=group_name, boss=boss['name'], boss_first=boss_first, player_before=before_hp, player_after=sum(s['pieces'][i]['hp'] for i in group['ids']), boss_before=before_b, boss_after=boss['hp'], events=events)
        s['events'].append(result); self.log(('보스 선공 ' if boss_first else '플레이어 선공 ') + boss['name']); return result

    def enemy_phase(self):
        s, reports = self.state, []
        for boss in [b for b in s['guards'] if b['role'] == 'extra' and b['hp'] > 0]:
            targets = lambda: [g for g in self.living() if g['pos'] is not None]
            target = next((g for g in targets() if boss['targetPieceId'] in g['ids']), None)
            if target is None:
                boss['targetPieceId'] = None
                for g in sorted(targets(), key=lambda g: g['id']):
                    path = self.board_path(boss['pos'], g['pos'])
                    if path is not None and len(path) - 1 <= boss['visionRange']:
                        target = g; boss['targetPieceId'] = g['ids'][0]; break
            report = dict(name=boss['name'], origin=boss['pos'], arrival=boss['pos'], hand=None, path=[], battle=None, target=boss['targetPieceId'])
            if target is None: reports.append(report); continue
            faces = [self.random() < self.rules['guardianCombat']['pFlat'] for _ in range(4)]; count = sum(faces)
            hand = self.hands['backdo'] if count == 1 and faces[0] else next(h for h in self.hands.values() if h['flats'] == count and not h.get('markedOnly'))
            boss['lastRoll'] = hand['id']; report['hand'] = hand['name']
            blocked = {self.physical(b['pos']) for b in s['guards'] if b is not boss and b['hp'] > 0}
            if hand['move'] < 0:
                if boss['history'] and boss['history'][-1] not in blocked: boss['pos'] = boss['history'].pop(); report['path'].append(boss['pos'])
            else:
                path = self.board_path(boss['pos'], target['pos'], blocked) or []
                for pos in path[1:hand['move'] + 1]:
                    boss['history'].append(boss['pos']); boss['pos'] = pos; report['path'].append(pos)
                    if any(self.same(g['pos'], pos) for g in targets()): break
            report['arrival'] = boss['pos']; contact = next((g for g in targets() if self.same(g['pos'], boss['pos'])), None)
            if contact is not None: report['battle'] = self.fight(contact, boss, True)
            reports.append(report)
        s['enemies'] = reports; return reports

    def master_phase(self):
        s = self.state; drain = self.field()['weightDrain']
        if drain:
            before = sum(p['weight'] for p in s['pieces'] if not p['settled'])
            for p in s['pieces'] + s['guards']:
                if p['hp'] > 0 and not p.get('settled'): self.grow(p, -drain)
                if p['weight'] == 0: p['hp'] = 0
            self.cleanup(); self.change('판 전체', sum(p['weight'] for p in s['pieces'] if not p['settled']) - before, self.field()['name'])
        if s['turn'] and s['turn'] % s['master']['cycle'] == 0:
            if self.row['pulseDamage']:
                before = sum(p['weight'] for p in s['pieces'])
                for g in self.living():
                    if g['pos'] is not None:
                        for i in g['ids']: s['pieces'][i]['hp'] = max(0, s['pieces'][i]['hp'] - self.row['pulseDamage'])
                self.cleanup(); self.change('빅 기믹', sum(p['weight'] for p in s['pieces']) - before, '갱신 충격 HP -' + str(self.row['pulseDamage']))
            s['master']['index'] = (s['master']['index'] + 1) % len(s['master']['plans']); self.log('마스터 갱신: ' + self.field()['name'])

    def preview(self, route=None):
        if self.state['phase'] != 'MOVE': return None
        clone = Game(self.data, self.state['seed']); clone.state = deepcopy(self.state)
        result = clone._move(route)
        return dict(revision=self.state['revision'], state=clone.state, **result)

    def _move(self, route=None):
        s = self.state; g = self.active(); path = self.movement(g, route)
        before, before_score, group_name = self.weight(g), s['score'], self.name(g)
        for step in path:
            if s['pending']['hand']['move'] < 0: g['history'].pop()
            else: g['history'].append(dict(pos=g['pos'], route=g['route']))
            g.update(step)
        arrival = g['pos']
        partner = next((x for x in s['groups'] if x is not g and g['pos'] not in (None, 'END') and self.same(x['pos'], g['pos'])), None)
        if partner:
            combined = g['ids'] + partner['ids']; main_id = min(combined, key=lambda i: (-s['pieces'][i]['weight'], i))
            previous = len(g['ids']) if main_id in g['ids'] else len(partner['ids'])
            support = self.rules['scoring']['stackSupportBonus'] + self.sum_trait('supportPerLevel') + (.25 if s['risk']['id'] == 'piggyback' else 0)
            p = s['pieces'][main_id]; old = p['weight']; self.grow(p, math.floor(p['weight'] * support * (len(combined) - previous)))
            self.change('업기', p['weight'] - old, '지원 말 합류'); g['ids'] = sorted(combined); s['groups'].remove(partner)
        p = s['pieces'][self.carrier(g)]; old_max, old = self.stats(p)['maxHp'], p['weight']
        p['attackFactor'], p['healthFactor'] = s['pending']['hand']['attackX'], s['pending']['hand']['healthX']
        value = self.calculate(s['pending'], p, len(g['ids'])); self.grow(p, value['gain'], old_max)
        self.change('윷가락', p['weight'] - old, s['pending']['hand']['name']); self.cleanup(); self.apply_tile(g)
        boss = self.boss_at(g['pos'])
        if boss and g['ids']: self.fight(g, boss)
        if g['ids'] and g['pos'] in ('G', 'END') and not any(b['hp'] > 0 and b['pos'] == 'G' for b in s['guards']):
            p = s['pieces'][self.carrier(g)]
            base, finish = self.calculate(s['pending'], p, len(g['ids'])), self.calculate(s['pending'], p, len(g['ids']), len(g['ids']))
            old = p['weight']; self.grow(p, finish['gain'] - base['gain']); self.change('완주', p['weight'] - old)
            s['score'] += sum(s['pieces'][i]['weight'] for i in g['ids'] if not s['pieces'][i]['settled'])
            for i in g['ids']: s['pieces'][i]['settled'] = True
            g['pos'] = 'END'
        self.finish_turn()
        return dict(path=path, arrival=arrival, before=before, after=self.weight(g), score_gain=s['score'] - before_score, group=group_name, value=value)

    def commit(self, projection):
        if not projection or self.state['phase'] != 'MOVE' or projection['revision'] != self.state['revision']: return False
        self.state = deepcopy(projection['state']); self.touch(); return True

    def finish_turn(self):
        s = self.state
        if s['score'] < s['target']: self.enemy_phase(); self.master_phase()
        s.update(selected=[], pending=None)
        if s['score'] >= s['target']:
            e = self.data['economy']; base = math.floor(self.row['baseReward'] * s['risk']['rewardX'] + .5); overflow = s['score'] - s['target']
            total = base + s['tosses'] * e['perRemainingToss'] + self.interest() + overflow // self.config['overflowStep'] * self.config['overflowCoins']
            s['reward'] = dict(total=total, overflow=overflow); s['phase'] = 'REWARD'
        else: s['phase'] = 'LOSE' if s['tosses'] <= 0 or not self.living() else 'DRAW'
        self.touch()

    def interest(self): return min(self.data['economy']['interestCap'] + self.sum_trait('interestCapPerLevel'), self.state['coins'] // self.data['economy']['interestPer'])
    def price(self, value): return max(1, value - self.sum_trait('discountPerLevel'))

    def claim_reward(self):
        s = self.state
        if s['phase'] != 'REWARD': return
        s['coins'] += s['reward']['total']; s['total'] += s['score']; s['phase'] = 'WIN' if s['round'] == len(self.rounds) - 1 else 'CHOICE'; self.touch()

    def enter_shop(self):
        if self.state['phase'] != 'CHOICE': return
        self.state['phase'] = 'SHOP'; self.roll_shop(); self.touch()

    def roll_shop(self):
        pools = self.data['shopPool']; third = 'pieceTrait' if self.random() < .5 else 'charm'
        kinds = [('stick', pools['sticks']), ('deckTrait', pools['deckTraits']), (third, pools['pieceTraits' if third == 'pieceTrait' else 'charms'])]
        self.state['shop'] = [dict(kind=kind, ref=pool[int(self.random() * len(pool))], sold=False) for kind, pool in kinds]

    def product(self, offer): return {'stick': self.sticks, 'deckTrait': self.traits, 'pieceTrait': self.piece_traits, 'charm': {x['id']: x for x in self.data['charms']}}[offer['kind']][offer['ref']]

    def buy(self, index, target=0):
        s = self.state
        if s['phase'] != 'SHOP': return False
        offer = s['shop'][index]; product = self.product(offer); cost = self.price(product['price'])
        if offer['sold'] or s['coins'] < cost: return False
        kind, key = offer['kind'], offer['ref']
        if kind == 'stick':
            if len(s['collection']) >= 32: return False
            self.add_item(key)
        elif kind == 'deckTrait':
            if len(s['deck_traits']) >= self.rules['deckTraitSlots'] or any(t['id'] == key for t in s['deck_traits']): return False
            s['deck_traits'].append(dict(id=key, level=1))
        elif kind == 'pieceTrait':
            traits = s['templates'][target]['traits']
            if len(traits) >= self.rules['pieceTraitSlots'] or key in traits: return False
            traits.append(key)
        else:
            if len(s['charms']) >= self.rules['charmSlots'] or key in s['charms']: return False
            s['charms'].append(key)
        s['coins'] -= cost; offer['sold'] = True; self.touch(); return True

    def advance_round(self, skip_shop=False):
        s = self.state
        if s['phase'] != ('CHOICE' if skip_shop else 'SHOP'): return
        if skip_shop: s['coins'] += self.interest()
        s['round'] += 1
        s.update(phase='TRAIT', score=0, pieces=[], groups=[], guards=[], master=None, hand=[], draw=[], selected=[], pending=None, feedback=[], enemies=[], events=[], last_roll=None)
        self.touch()

    def toggle_deck(self, uid):
        s = self.state
        if s['phase'] not in ('SHOP', 'PREP'): return
        if uid in s['deck']: s['deck'].remove(uid)
        elif len(s['deck']) < s['capacity']: s['deck'].append(uid)
        self.touch()

    def upgrade_piece(self, index):
        s, c = self.state, self.config; p = s['templates'][index]; cost = self.price(c['pieceUpgradeCost'] * (p['level'] + 1))
        if s['phase'] != 'SHOP' or p['level'] >= 6 or s['coins'] < cost: return False
        s['coins'] -= cost; p['level'] += 1
        for key, conf in [('baseWeight', 'pieceUpgradeWeight'), ('baseHealth', 'pieceUpgradeHealth'), ('baseAttack', 'pieceUpgradeAttack')]: p[key] += c[conf]
        p['healthCoeff'] += .01; p['attackCoeff'] += .01
        if p['level'] % 3 == 0: p['moveSpeed'] += 1
        self.touch(); return True

    def upgrade_stick(self, uid):
        s = self.state; item = self.item(uid); level = next((x for x in self.data['stickUpgrade']['levels'] if x['level'] == item['level'] + 1), None)
        if s['phase'] != 'SHOP' or level is None or s['coins'] < self.price(level['cost']): return False
        s['coins'] -= self.price(level['cost']); success = self.random() < level['success']
        if success: item['level'] += 1
        elif level['onFail'] != 'keep': item['level'] = max(0, item['level'] - 1)
        self.touch(); return success

    def remove_stick(self, uid, sell=False):
        s = self.state
        if s['phase'] != 'SHOP' or len(s['collection']) <= self.rules['minDeckSize']: return
        cost = 0 if sell else self.price(self.data['economy']['removeStickCost'])
        if s['coins'] < cost: return
        item = self.item(uid); s['coins'] += math.floor(self.sticks[item['type']]['price'] * self.data['economy']['sellRatio']) if sell else -cost
        s['collection'].remove(item); s['deck'] = [i for i in s['deck'] if i != uid]; self.touch()

    def place(self, group, pos, route='outer'):
        if pos is not None and pos not in self.board['routes'][route]: raise ValueError('경로에 없는 칸입니다.')
        group.update(pos=pos, route=route, history=[])
        if pos is not None: group['history'] = [dict(pos=None if p == '0' else p, route=route) for p in self.board['routes'][route][:self.board['routes'][route].index(pos)]]
        self.touch()

    def outcomes(self, items):
        rows = {key: dict(probability=0.0, min=None, max=None) for key in self.hands}
        for mask in range(16):
            faces = ['flat' if mask & (1 << i) else 'back' for i in range(4)]
            probability = math.prod(self.sticks[self.item(uid)['type']]['pFlat'] if face == 'flat' else 1 - self.sticks[self.item(uid)['type']]['pFlat'] for uid, face in zip(items, faces))
            hand = self.hand_for(items, faces); gain = self.calculate(dict(items=items, faces=faces, hand=hand))['gain']
            row = rows[hand['id']]; row['probability'] += probability
            if probability:
                row['min'] = gain if row['min'] is None else min(row['min'], gain)
                row['max'] = gain if row['max'] is None else max(row['max'], gain)
        return rows

    def expand_capacity(self):
        s = self.state; cost = self.price(self.config['deckCapacityCost'])
        if s['phase'] != 'SHOP' or s['capacity'] >= self.config['deckCapacityMax'] or s['coins'] < cost: return False
        s['coins'] -= cost; s['capacity'] += 1; self.touch(); return True

    def upgrade_deck_trait(self, index):
        s = self.state; trait = s['deck_traits'][index]; cost = self.price(self.config['traitUpgradeCost'] * trait['level'])
        if s['phase'] != 'SHOP' or trait['level'] >= 3 or s['coins'] < cost: return False
        s['coins'] -= cost; trait['level'] += 1; self.touch(); return True

    def remove_deck_trait(self, index):
        if self.state['phase'] in ('SHOP', 'PREP'):
            self.state['deck_traits'].pop(index); self.touch()

    def remove_piece_trait(self, target, index):
        if self.state['phase'] == 'SHOP':
            self.state['templates'][target]['traits'].pop(index); self.touch()
