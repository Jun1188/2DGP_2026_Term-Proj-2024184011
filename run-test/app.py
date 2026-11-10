"""pico2d scene runner. SDL is imported only when App.run() is called."""
from pathlib import Path
import math
import os
import time
import json
from engine import Game, ROOT
from scenes import catalog, load_scene
from view_model import LAYER_NAMES, snapshot_layers, visible_layers

W, H = 1280, 900
INK, MUTED, GOLD, RED, GREEN = (230, 234, 240), (150, 160, 180), (237, 190, 95), (245, 120, 130), (110, 222, 177)

class App:
    def __init__(self, scene='stack', seed=20261109, font=None, diagnostics=False):
        self.game = load_scene(Game(seed=seed), scene, seed)
        self.rows = catalog(self.game.data); self.page = next(i for i, r in enumerate(self.rows) if r[0] == scene) // 8
        self.font_path = font; self.diagnostics = diagnostics
        self.layers = {name: True for name in LAYER_NAMES}
        self.buttons = []; self.mouse = (0, 0); self.hover_path = None
        self.shop_services = False; self.edit = False; self.edit_index = 0; self.target = 0; self.inventory_page = 0
        self.message = '장면 선택 후 드로우 → 공개 → 윷 4개 선택 → 투척'
        self.reduced = False; self.effects = True; self.fx_start = 0; self.fx_rows = []; self.drawing_until = 0
        self.metric_before = 0; self.metric_after = 0; self.metric_start = 0; self.sprite = None

    def find_font(self):
        candidates = [self.font_path] if self.font_path else []
        candidates += [str(ROOT / 'assets' / 'font.ttf'), str(Path(os.environ.get('WINDIR', 'C:/Windows')) / 'Fonts' / 'malgun.ttf'), '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc', '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc']
        found = next((p for p in candidates if p and Path(p).is_file()), None)
        if not found: raise RuntimeError('한글 TTF가 필요합니다. --font 경로를 지정하거나 assets/font.ttf를 넣으세요.')
        return found

    def text(self, x, y, value, color=INK, big=False):
        (self.large if big else self.font).draw(x, y, str(value), color)

    def box(self, x, y, w, h, color=(38, 45, 60), filled=True):
        self.p.draw_rectangle(x, y, x + w, y + h, *color, filled=filled)

    def button(self, x, y, w, h, title, callback, enabled=True):
        hot = x <= self.mouse[0] <= x + w and y <= self.mouse[1] <= y + h
        self.box(x, y, w, h, (65, 82, 110) if hot and enabled else (38, 45, 60))
        self.text(x + 7, y + h / 2 - 4, title, INK if enabled else (95, 100, 115))
        if enabled: self.buttons.append((x, y, w, h, callback))
        return hot

    def lines(self, x, y, text, width=30, color=MUTED):
        for paragraph in str(text).splitlines():
            for offset in range(0, max(1, len(paragraph)), width):
                self.text(x, y, paragraph[offset:offset + width], color); y -= 20
        return y

    def xy(self, pos):
        nodes = {n['id']: n for n in self.game.board['nodes']}
        node = nodes[self.game.physical(pos or '0')]
        scale = min(460 / max(n['x'] for n in nodes.values()), 440 / max(n['y'] for n in nodes.values()))
        return 300 + node['x'] * scale, 795 - node['y'] * scale

    def scene(self, key):
        load_scene(self.game, key); self.edit = False; self.hover_path = None
        self.inventory_page = 0; self.fx_rows = []; self.metric_before = self.metric_after = sum(self.game.weight(g) for g in self.game.living())
        self.message = dict(self.rows)[key]; self.drawing_until = 0

    def feedback(self):
        self.fx_rows = list(self.game.state['feedback']); self.fx_start = time.monotonic()
        self.metric_before = self.metric_after
        self.metric_after = sum(self.game.weight(g) for g in self.game.living()); self.metric_start = self.fx_start
        events = self.game.state['events']
        if events:
            e = events[-1]
            self.message = ('보스 선공' if e['boss_first'] else '말 선공') + ' · 말 HP ' + str(e['player_before']) + ' → ' + str(e['player_after']) + ' / 보스 ' + str(e['boss_before']) + ' → ' + str(e['boss_after'])

    def move(self, route):
        projection = self.game.preview(route)
        if self.game.commit(projection): self.feedback()
        self.hover_path = None

    def toss(self):
        g = self.game; g.toss(g.state['forced'])
        if g.state['phase'] == 'MOVE' and len(g.route_options()) == 1: self.move(g.route_options()[0])
        elif g.state['phase'] != 'MOVE': self.feedback()

    def primary(self):
        s = self.game.state
        if self.edit: return
        if s['phase'] == 'DRAW': self.game.draw_hand(); self.drawing_until = time.monotonic() + (0 if self.reduced else .4)
        elif s['phase'] == 'REVEAL' and time.monotonic() >= self.drawing_until: self.game.reveal_hand()
        elif s['phase'] == 'SELECT': self.toss()
        elif s['phase'] == 'REWARD': self.game.claim_reward()
        elif s['phase'] == 'PREP': self.game.start_round()

    def toggle_layer(self, name): self.layers[name] = not self.layers[name]

    def sidebar(self):
        self.text(15, 795, '장면별 수동 진단', GOLD)
        self.button(15, 756, 95, 30, '이전 목록', lambda: setattr(self, 'page', max(0, self.page - 1)))
        self.button(120, 756, 110, 30, '다음 목록', lambda: setattr(self, 'page', min((len(self.rows) - 1) // 8, self.page + 1)))
        for i, (key, label) in enumerate(self.rows[self.page * 8:self.page * 8 + 8]):
            self.button(15, 720 - i * 30, 215, 27, label[:18], lambda key=key: self.scene(key))
        self.text(15, 465, '레이어 표시 · 진단', GOLD)
        for i, name in enumerate(LAYER_NAMES):
            self.button(15, 431 - i * 25, 215, 23, ('[ON] ' if self.layers[name] else '[OFF] ') + name, lambda name=name: self.toggle_layer(name))
        self.button(15, 228, 102, 27, '편집 ' + ('ON' if self.edit else 'OFF'), lambda: setattr(self, 'edit', not self.edit), bool(self.game.state['pieces']))
        self.button(125, 228, 105, 27, '효과 ' + ('ON' if self.effects else 'OFF'), lambda: setattr(self, 'effects', not self.effects))
        self.button(15, 193, 215, 27, '동작 줄이기 ' + str(self.reduced), lambda: setattr(self, 'reduced', not self.reduced))
        self.button(15, 158, 215, 27, 'F5 상태 JSON 저장', self.save)
        if self.diagnostics:
            self.button(15, 121, 215, 27, '단계 진단: 적 턴만 실행', lambda: self.diagnostic_step('enemy'), bool(self.game.state['pieces']))
            self.button(15, 89, 215, 27, '단계 진단: 마스터 1틱', lambda: self.diagnostic_step('master'), bool(self.game.state['pieces']))
        else: self.lines(15, 130, 'SPACE 진행 / R 교체 / 1~6 손패 / ESC 종료', 17)
        self.text(15, 55, '진단도구' if self.diagnostics else 'pico2d run-test', GOLD)

    def draw_board(self, layers):
        if 'board' in layers:
            for route in layers['board']['paths'].values():
                for a, b in zip(route, route[1:]): self.p.draw_line(*self.xy(a), *self.xy(b), 90, 104, 128)
            for n in layers['board']['nodes']:
                x, y = self.xy(n['id']); self.box(x - 10, y - 10, 20, 20, (75, 87, 110)); self.text(x - 8, y - 27, n['id'], MUTED)
        if 'specials' in layers:
            for t in layers['specials']:
                x, y = self.xy(t['pos']); effect = next(v for v in self.game.data['specialTiles'] if v['id'] == t['type'])
                self.box(x - 15, y - 15, 30, 30, (100, 80, 38)); self.text(x - 12, y - 5, effect['symbol'], GOLD)
        if 'bosses' in layers:
            for b in layers['bosses']:
                x, y = self.xy(b['pos']); self.box(x - 18, y - 18, 36, 36, (135, 45, 62)); self.text(x - 13, y - 5, 'G' if b['role'] == 'gate' else 'B', INK)
                self.text(x - 18, y + 25, str(b['hp']), RED)
        if 'path' in layers and layers['path']:
            points = [self.xy(self.game.active()['pos'])] + [self.xy(step['pos']) for step in layers['path']]
            for a, b in zip(points, points[1:]): self.p.draw_line(*a, *b, *GOLD)
        if 'pieces' in layers:
            for unit in layers['pieces']:
                if unit['pos'] is None: x, y = 300 + unit['ids'][0] * 70, 310
                else: x, y = self.xy(unit['pos'])
                self.box(x - 17, y - 17, 34, 34, (35, 130, 116)); self.text(x - 13, y - 5, unit['name'], INK)
        self.text(280, 825, ('확장 외곽 28칸' if self.game.row['type'] == 'boss' else '일반 외곽 20칸') + ' / 특수칸 ' + str(len(self.game.plan_now()['tiles'])), GOLD)
        for i in range(4):
            self.button(275 + i * 145, 263, 135, 30, '말 ' + 'ABCD'[i] + ' 선택', lambda i=i: self.choose_piece(i), not self.edit and self.game.state['phase'] in ('DRAW', 'REVEAL', 'SELECT'))

    def choose_piece(self, index):
        group = next((g for g in self.game.living() if index in g['ids']), None)
        if group is not None: self.game.state['active'] = group['id']; self.game.touch()

    def cycle_forced(self):
        values = [None] + list(self.game.hands); s = self.game.state
        s['forced'] = values[(values.index(s['forced']) + 1) % len(values)]

    def edit_unit(self):
        units = self.game.state['pieces'] + self.game.state['guards']
        return units[self.edit_index % len(units)]

    def adjust(self, key, delta):
        unit = self.edit_unit(); value = unit.get(key, 0) + delta
        self.game.edit_unit(unit, **{key: round(value, 3)})
        self.metric_before = self.metric_after = sum(self.game.weight(g) for g in self.game.living())

    def editor_panel(self):
        unit = self.edit_unit()
        self.button(900, 748, 350, 30, '편집 대상 ' + str(unit['id']) + ' (다음)', lambda: setattr(self, 'edit_index', self.edit_index + 1))
        self.lines(900, 722, '보드 칸을 클릭하면 선택한 말/보스를 이동합니다.', 26)
        for row, (key, delta, title) in enumerate([('weight', 100, '보유 W'), ('healthScale', .1, '추가 HP 배율'), ('attackScale', .1, '추가 공격 배율')] + ([('visionRange', 1, '시야')] if unit.get('role') == 'extra' else [])):
            y = 640 - row * 52
            self.text(900, y + 25, title + ' ' + str(unit.get(key)))
            self.button(900, y - 7, 60, 27, '-', lambda key=key, delta=delta: self.adjust(key, -delta))
            self.button(970, y - 7, 60, 27, '+', lambda key=key, delta=delta: self.adjust(key, delta))
        self.lines(900, 405, 'HP/공격 ' + str(self.game.stats(unit)) + '\n받은 피해량을 보존합니다.', 28)

    def teleport(self, pos):
        unit = self.edit_unit()
        if unit.get('role'):
            if pos in ('END', 'J'): return
            unit['pos'] = pos; unit['history'] = []; self.game.touch()
        else:
            if pos == 'END': return
            group = next((g for g in self.game.living() if unit['id'] in g['ids']), None)
            if group:
                route = group['route'] if pos in self.game.board['routes'][group['route']] else next(k for k, path in self.game.board['routes'].items() if pos in path)
                self.game.place(group, pos, route)

    def diagnostic_step(self, kind):
        s = self.game.state; s['feedback'] = []; s['events'] = []
        if kind == 'enemy': self.game.enemy_phase()
        else: s['turn'] += 1; self.game.master_phase()
        if not self.game.living(): s['phase'] = 'LOSE'; s['pending'] = None
        self.game.touch(); self.feedback(); self.message = '단독 단계 실행: ' + kind + ' / 장면 재선택으로 초기화'

    def shop_management(self):
        g, s = self.game, self.game.state
        self.text(900, 718, '덱 특성 관리', GOLD)
        for i, trait in enumerate(s['deck_traits']):
            y = 650 - i * 60
            self.text(900, y + 35, g.traits[trait['id']]['name'] + ' Lv' + str(trait['level']))
            self.button(900, y, 165, 28, '특성 강화', lambda i=i: g.upgrade_deck_trait(i))
            self.button(1080, y, 165, 28, '특성 삭제', lambda i=i: g.remove_deck_trait(i))
        self.button(900, 490, 350, 28, '말 특성 대상: ' + 'ABCD'[self.target], lambda: setattr(self, 'target', (self.target + 1) % 4))
        for i, trait in enumerate(s['templates'][self.target]['traits']):
            self.button(900, 450 - i * 35, 350, 30, g.piece_traits[trait]['name'] + ' 삭제', lambda i=i: g.remove_piece_trait(self.target, i))
        self.text(900, 365, '보유 부적: ' + ', '.join(s['charms']), MUTED)
        self.button(900, 320, 350, 30, '출전 상한 +1 (' + str(g.price(g.config['deckCapacityCost'])) + '냥)', g.expand_capacity)
        self.button(900, 278, 350, 30, '다음 라운드 리스크 선택', g.advance_round)

    def reroll(self):
        s = self.game.state; e = self.game.data['economy']; cost = e['rerollBase'] + s['rerolls'] * e['rerollStep']
        if s['phase'] == 'SHOP' and s['coins'] >= cost:
            s['coins'] -= cost; s['rerolls'] += 1; self.game.roll_shop(); self.game.touch()

    def right_panel(self):
        g, s = self.game, self.game.state
        self.text(900, 795, s['phase'] + ' / ' + g.field()['name'], GOLD)
        if self.edit and s['pieces']: self.editor_panel(); return
        if s['phase'] == 'MOVE':
            self.text(900, 762, '보드 옆 경로 선택', INK)
            for i, route in enumerate(g.route_options()):
                projection = g.preview(route); y = 675 - i * 100
                hot = self.button(900, y, 350, 33, ('지름길' if i else '현재 길') + ' → ' + str(projection['arrival']) + ' 이동', lambda route=route: self.move(route))
                if hot: self.hover_path = projection
                self.text(900, y + 59, '칸 ' + str(len(projection['path'])) + ' / W ' + str(projection['before']) + ' → ' + str(projection['after']), MUTED)
                self.text(900, y + 39, '예상 정산 +' + str(projection['score_gain']) + ' / 전투 ' + str(len(projection['state']['events'])), MUTED)
        elif s['phase'] in ('DRAW', 'REVEAL', 'SELECT', 'PREP', 'REWARD'):
            labels = dict(DRAW='1. 윷 드로우', REVEAL='2. 손패 공개', SELECT='3. 선택한 윷 던지기', PREP='이 덱으로 출전', REWARD='보상 수령 → 다음 선택')
            enabled = s['phase'] != 'SELECT' or len(s['selected']) == 4
            enabled = enabled and (s['phase'] != 'REVEAL' or time.monotonic() >= self.drawing_until)
            self.button(900, 735, 350, 36, labels[s['phase']], self.primary, enabled)
            self.button(900, 689, 350, 31, '플레이어 결과: ' + (g.hands[s['forced']]['name'] if s['forced'] else '난수'), self.cycle_forced)
            if s['phase'] == 'SELECT':
                self.button(900, 648, 350, 31, '선택 윷 교체 / 남은 ' + str(s['swaps']), g.swap, bool(s['selected']) and s['swaps'] > 0)
                if len(s['selected']) == 4:
                    odds = g.outcomes(s['selected'])
                    self.lines(900, 625, ' / '.join(g.hands[k]['name'] + ' ' + str(round(v['probability'] * 100)) + '%' for k, v in odds.items()), 32)
            if s['phase'] == 'REWARD': self.lines(900, 630, str(s['reward']), 30)
            if s['phase'] == 'PREP': self.lines(900, 630, '아래 보유 윷을 클릭해 출전 덱 구성. 최소 4개. 구매 윷은 자동 출전하지 않습니다.', 28)
        elif s['phase'] == 'CHOICE':
            self.button(900, 735, 350, 35, '상점 입장', g.enter_shop)
            self.button(900, 690, 350, 35, '상점 건너뛰기 / 추가 이자 +' + str(g.interest()), lambda: g.advance_round(True))
        elif s['phase'] == 'TRAIT':
            for i, risk in enumerate(g.data['riskChoices']):
                self.button(900, 750 - i * 30, 350, 27, risk['name'] + ' · 목표 x' + str(risk['targetX']), lambda key=risk['id']: g.set_risk(key))
            return
        elif s['phase'] == 'SHOP':
            self.button(900, 752, 350, 28, '상품 / 빌드 관리 전환', lambda: setattr(self, 'shop_services', not self.shop_services))
            if self.shop_services: self.shop_management(); return
            for i, offer in enumerate(s['shop']):
                product = g.product(offer); y = 690 - i * 75
                self.text(900, y + 47, product['name'] + ' / ' + str(g.price(product['price'])) + '냥', GOLD)
                self.button(900, y + 4, 350, 31, '구매 완료' if offer['sold'] else '구매 (대상 말 ' + 'ABCD'[self.target] + ')', lambda i=i: g.buy(i, self.target), not offer['sold'])
            self.button(900, 496, 170, 28, '구매 대상 ' + 'ABCD'[self.target], lambda: setattr(self, 'target', (self.target + 1) % 4))
            self.button(1080, 496, 170, 28, '상품 다시 뽑기', self.reroll)
            for i in range(4): self.button(900 + (i % 2) * 177, 455 - (i // 2) * 35, 170, 30, '말 ' + 'ABCD'[i] + ' 강화 Lv' + str(s['templates'][i]['level']), lambda i=i: g.upgrade_piece(i))
            self.button(900, 375, 350, 30, '다음 라운드 리스크 선택', g.advance_round)
            return
        else:
            self.text(900, 741, '런 완료' if s['phase'] == 'WIN' else '런 종료', GOLD, True)
            self.button(900, 680, 350, 35, '같은 시드로 다시 시작', lambda: self.scene('play'))
        y = 565 if s['phase'] != 'MOVE' else 445
        for boss in s['guards']:
            if boss['role'] != 'extra': continue
            self.text(900, y, boss['name'] + ' @' + boss['pos'] + ' HP ' + str(boss['hp']), RED); y -= 20
            target = '미발견' if boss['targetPieceId'] is None else 'ABCD'[boss['targetPieceId']] + ' 추적'
            self.text(900, y, '시야 ' + str(boss['visionRange']) + ' / ' + target + ' / ' + str(boss['lastRoll']), MUTED); y -= 25
        if s['events']:
            e = s['events'][-1]
            self.lines(900, min(y, 360), ('보스 선공' if e['boss_first'] else '말 선공') + ' HP ' + str(e['player_before']) + ' → ' + str(e['player_after']) + ' / 적 ' + str(e['boss_before']) + ' → ' + str(e['boss_after']), 28)

    def hand_panel(self):
        g, s = self.game, self.game.state
        if s['phase'] in ('SHOP', 'PREP'):
            items = s['collection']; pages = max(1, (len(items) + 7) // 8); self.inventory_page %= pages
            self.button(275, 216, 140, 26, '보유함 이전', lambda: setattr(self, 'inventory_page', (self.inventory_page - 1) % pages))
            self.button(425, 216, 140, 26, '보유함 다음', lambda: setattr(self, 'inventory_page', (self.inventory_page + 1) % pages))
            self.text(590, 226, '출전 ' + str(len(s['deck'])) + '/' + str(s['capacity']) + ' · 페이지 ' + str(self.inventory_page + 1))
            for i, item in enumerate(items[self.inventory_page * 8:self.inventory_page * 8 + 8]):
                uid = item['uid']; x = 275 + i * 122
                self.button(x, 150, 115, 55, ('[출전] ' if uid in s['deck'] else '') + g.sticks[item['type']]['name'][:6], lambda uid=uid: g.toggle_deck(uid), not self.edit)
                self.text(x, 135, 'Lv ' + str(item['level']))
                if s['phase'] == 'SHOP':
                    self.button(x, 96, 115, 26, '강화', lambda uid=uid: g.upgrade_stick(uid))
                    self.button(x, 63, 55, 26, '삭제', lambda uid=uid: g.remove_stick(uid))
                    self.button(x + 60, 63, 55, 26, '판매', lambda uid=uid: g.remove_stick(uid, True))
            return
        if s['phase'] not in ('DRAW', 'REVEAL', 'SELECT', 'MOVE'): return
        self.text(275, 227, '덱 ' + str(len(s['draw'])) + '개 / 손패 ' + str(len(s['hand'])) + '개 / 선택 ' + str(len(s['selected'])) + '/4 · 선택 시 12px 올림', GOLD)
        for i, uid in enumerate(s['hand']):
            x, y = 275 + i * 155, 65 + (12 if uid in s['selected'] else 0)
            item = g.item(uid); stick = g.sticks[item['type']]
            concealed = s['phase'] == 'REVEAL' and uid in s['last_draw']
            label = '비공개' if concealed else stick['name']
            self.button(x, y, 143, 135, label, lambda uid=uid: g.select(uid), s['phase'] == 'SELECT' and not self.edit and (uid in s['selected'] or len(s['selected']) < 4))
            self.text(x + 9, y + 107, str(i + 1) + ' / #' + str(uid), MUTED)
            if not concealed:
                self.text(x + 9, y + 30, '배 ' + str(round(stick['pFlat'] * 100)) + '% / +' + str(item['level']), GOLD)
                if uid in s['selected']: self.text(x + 9, y + 8, '선택됨', GREEN)
            if concealed and not self.reduced:
                t = max(0, min(1, 1 - (self.drawing_until - time.monotonic()) / .4))
                if t < 1: self.box(250 + (x - 250) * t, 240 + (y - 240) * t, 40, 60, (155, 120, 60))

    def metrics(self):
        s = self.game.state; live = sum(self.game.weight(g) for g in self.game.living()); t = time.monotonic() - self.metric_start
        anim = not self.reduced and 0 <= t < .6 and self.metric_after == live
        shown = round(self.metric_before + (live - self.metric_before) * (1 - (1 - t / .6) ** 3)) if anim else live
        delta = self.metric_after - self.metric_before; lift = math.sin(t / .6 * math.pi) * (-6 if delta < 0 else 6) if anim else 0
        self.text(275, 862, '윷토체스 pico2d · ' + self.game.row['id'], GOLD)
        self.text(560, 862 + lift, '보유 ' + format(shown, ','), RED if anim and delta < 0 else GREEN, True)
        self.text(850, 868, '완주 ' + str(s['score']) + ' / 목표 ' + str(s['target']))
        self.text(850, 844, '투척 ' + str(s['tosses']) + ' / 교체 ' + str(s['swaps']) + ' / ' + str(s['coins']) + '냥 / 이자 ' + str(self.game.interest()))

    def draw_score_effect(self):
        t = time.monotonic() - self.metric_start; delta = self.metric_after - self.metric_before
        if self.reduced or not self.effects or not self.sprite or not 0 <= t < .6 or not delta: return
        power = 3 if abs(delta) >= 1000 else 2 if abs(delta) >= 100 else 1
        lift = math.sin(t / .6 * math.pi) * (-3 * power if delta < 0 else 3 * power)
        self.sprite.opacify(max(0, math.sin(t / .6 * math.pi) * .6)); size = 50 + 30 * power * t / .6
        self.sprite.composite_draw(t * (-1 if delta < 0 else 1), '', 650, 855 + lift, size, size)

    def save(self):
        payload = dict(kind='yutochess-pico2d-diagnostic', dataVersion=self.game.data['version'], layers=self.layers, state=self.game.state)
        (ROOT / 'saved-scene.json').write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8-sig')
        self.message = 'saved-scene.json 저장 완료 (pico2d 전용 진단 스냅샷)'

    def render(self):
        self.buttons = []; self.hover_path = None
        self.p.clear_canvas(); self.box(0, 0, W, H, (20, 25, 36))
        self.sidebar(); self.right_panel()
        layers = visible_layers(snapshot_layers(self.game, self.hover_path), self.layers)
        if 'fx' in layers: self.draw_score_effect()
        if 'ui' in layers:
            self.metrics(); self.hand_panel()
            feedback = ' / '.join(r['source'] + ' ' + format(r['delta'], '+,') for r in self.game.state['feedback'])
            self.text(275, 25, feedback[:80], GOLD)
        self.draw_board(layers)
        self.text(15, 12, self.message[:95], MUTED)
        if self.diagnostics:
            self.text(275, 805, '진단: rng=' + str(self.game.state['rng']) + ' rev=' + str(self.game.state['revision']) + ' turn=' + str(self.game.state['turn']), MUTED)
        self.p.update_canvas()

    def run(self):
        import pico2d as p
        self.p = p; p.open_canvas(W, H, sync=True)
        try:
            path = self.find_font(); self.font = p.load_font(path, 14); self.large = p.load_font(path, 23)
            try: self.sprite = p.load_image(str(ROOT / 'assets/score-burst.png'))
            except (OSError, IOError): self.message = '점수 이미지 로드 실패: 숫자 효과로 진행합니다.'
            running = True
            while running:
                for event in p.get_events():
                    if event.type == p.SDL_QUIT or (event.type == p.SDL_KEYDOWN and event.key == p.SDLK_ESCAPE): running = False
                    elif event.type == p.SDL_MOUSEMOTION: self.mouse = (event.x, H - 1 - event.y)
                    elif event.type == p.SDL_MOUSEBUTTONDOWN and event.button == 1:
                        self.mouse = (event.x, H - 1 - event.y)
                        hit = next((b for b in self.buttons if b[0] <= self.mouse[0] <= b[0] + b[2] and b[1] <= self.mouse[1] <= b[1] + b[3]), None)
                        try:
                            if hit: hit[4]()
                            elif self.edit:
                                nearest = min(self.game.board['nodes'], key=lambda n: math.dist(self.xy(n['id']), self.mouse))
                                if math.dist(self.xy(nearest['id']), self.mouse) <= 24: self.teleport(nearest['id'])
                        except (ValueError, KeyError) as error: self.message = str(error)
                    elif event.type == p.SDL_KEYDOWN:
                        try:
                            if event.key == p.SDLK_SPACE: self.primary()
                            elif event.key == p.SDLK_r and not self.edit: self.game.swap()
                            elif event.key == p.SDLK_F5: self.save()
                            elif not self.edit and ord('1') <= event.key <= ord('6'):
                                i = event.key - ord('1')
                                if i < len(self.game.state['hand']): self.game.select(self.game.state['hand'][i])
                        except (ValueError, KeyError) as error: self.message = str(error)
                self.render(); p.delay(.01)
        finally: p.close_canvas()
