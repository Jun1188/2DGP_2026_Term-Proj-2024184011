"""pico2d scene runner. SDL is imported only when App.run() is called."""
from pathlib import Path
import math
import os
import time
import json
from engine import Game, ROOT
from scenes import catalog, load_scene, next_player_hand
from view_model import LAYER_NAMES, snapshot_layers, visible_layers

W, H = 1280, 900
DEAL_FLIGHT, DEAL_STAGGER = .32, .044
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
        self.metric_start = 0; self.sprite = None; self.reset_score_feedback()

    def find_font(self):
        candidates = [self.font_path] if self.font_path else []
        candidates += [str(ROOT / 'assets' / 'font.ttf'), str(Path(os.environ.get('WINDIR', 'C:/Windows')) / 'Fonts' / 'malgun.ttf'), '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc', '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc']
        found = next((p for p in candidates if p and Path(p).is_file()), None)
        if not found: raise RuntimeError('한글 TTF가 필요합니다. --font 경로를 지정하거나 assets/font.ttf를 넣으세요.')
        return found

    def text(self, x, y, value, color=INK, big=False):
        (self.large if big else self.font).draw(round(x), round(y), str(value), color)

    def box(self, x, y, w, h, color=(38, 45, 60), filled=True):
        self.p.draw_rectangle(round(x), round(y), round(x + w), round(y + h), *color, filled=filled)

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
        board = self.game.board
        if getattr(self, '_layout_board', None) is not board:
            nodes = board['nodes']
            scale = min(460 / max(n['x'] for n in nodes), 440 / max(n['y'] for n in nodes))
            self._board_centers = {n['id']: (round(300 + n['x'] * scale), round(795 - n['y'] * scale)) for n in nodes}
            self._layout_board = board
        return self._board_centers[self.game.physical(pos or '0')]

    def piece_xy(self, unit):
        if unit['pos'] is None:
            return 300 + unit['ids'][0] * 70, 310
        return self.xy(unit['pos'])

    def scene(self, key):
        load_scene(self.game, key); self.edit = False; self.hover_path = None
        self.inventory_page = 0; self.reset_score_feedback()
        self.message = dict(self.rows)[key]; self.drawing_until = 0

    def reset_score_feedback(self):
        self.board_motion = None
        self.key_route = None
        self.preview_revision = None
        self.route_previews = {}
        self.roll_start = 0
        self.fx_rows = []; self.metric_round = self.game.state['round']
        self.metric_before = self.metric_after = sum(self.game.weight(g) for g in self.game.living())
        self.settled_before = self.settled_after = self.game.state['score']

    def score_event(self):
        if self.reduced: return None
        now = time.monotonic()
        return next((r for r in self.fx_rows if 0 <= now - r['start'] < .6), None)

    def feedback(self):
        self.fx_start = time.monotonic()
        self.fx_rows = [r for r in self.fx_rows if self.fx_start < r['start'] + .6]
        start = max(self.fx_start, self.fx_rows[-1]['start'] + .65 if self.fx_rows else self.fx_start)
        for row in self.game.state['feedback']:
            if self.reduced or not row['delta']: continue
            self.fx_rows.append(dict(row, start=start)); start += .65
        self.metric_before = self.metric_after
        self.settled_before, self.settled_after = self.settled_after, self.game.state['score']
        self.metric_after = sum(self.game.weight(g) for g in self.game.living()); self.metric_start = self.fx_start
        events = self.game.state['events']
        if events:
            e = events[-1]
            self.message = ('보스 선공' if e['boss_first'] else '말 선공') + ' · 말 HP ' + str(e['player_before']) + ' → ' + str(e['player_after']) + ' / 보스 ' + str(e['boss_before']) + ' → ' + str(e['boss_after'])

    def preview_route(self, route):
        revision = self.game.state['revision']
        if self.preview_revision != revision:
            self.route_previews.clear()
            self.preview_revision = revision
        if route not in self.route_previews:
            self.route_previews[route] = self.game.preview(route)
        return self.route_previews[route]

    def move(self, route):
        if self.edit or self.game.state['phase'] != 'MOVE': return
        projection = self.preview_route(route)
        self.hover_path = None
        self.key_route = None
        if not projection: return
        before = None if self.reduced else snapshot_layers(self.game)
        active_id = self.game.active()['id']
        if not self.game.commit(projection): return
        self.route_previews.clear()
        self.feedback()
        if before is None: return

        moving = next(unit for unit in before['pieces'] if unit['id'] == active_id)
        before['pieces'].remove(moving)
        before['pieces'].append(moving)
        points = [self.piece_xy(moving)]
        path = projection['path']
        if moving['pos'] is None and path:
            points.append(self.xy('0'))
        points.extend(self.xy(step['pos']) for step in path)
        arrival = projection['arrival']
        if arrival is None and path:
            points.append(self.piece_xy(dict(moving, pos=None)))
        if projection['score_gain'] and arrival != 'END':
            points.append(self.xy('END'))

        state = self.game.state
        strength, color = 1, GREEN
        if projection['score_gain']:
            strength, color = 3, GOLD
        elif any(not event['boss_first'] for event in state['events']) or any(
            enemy['battle'] and self.game.same(enemy['arrival'], arrival) for enemy in state['enemies']
        ):
            strength, color = 2, RED
        elif any(row['source'] in ('업기', '특수칸') for row in state['feedback']):
            strength, color = 2, GOLD
        self.board_motion = dict(start=time.monotonic(), points=points, moving_id=active_id, before=before,
                                 step=min(.20, .98 / max(1, len(points) - 1)), strength=strength, color=color)

    def toss(self):
        g = self.game
        if not g.toss(next_player_hand(g)): return
        self.key_route = None
        self.board_motion = None
        self.roll_start = time.monotonic() if not self.reduced else 0
        if g.state['phase'] == 'MOVE':
            options = g.route_options()
            if len(options) == 1: self.move(options[0])
        else: self.feedback()

    def primary(self):
        s = self.game.state
        if self.edit or (s['phase'] == 'REWARD' and self.board_motion): return
        if s['phase'] == 'DRAW':
            self.game.draw_hand()
            duration = DEAL_FLIGHT + DEAL_STAGGER * max(0, len(s['last_draw']) - 1)
            self.drawing_until = time.monotonic() + (0 if self.reduced else duration)
        elif s['phase'] == 'REVEAL' and time.monotonic() >= self.drawing_until: self.game.reveal_hand()
        elif s['phase'] == 'SELECT': self.toss()
        elif s['phase'] == 'REWARD': self.game.claim_reward()
        elif s['phase'] == 'PREP' and len(s['deck']) >= self.game.rules['minDeckSize']:
            self.game.start_round()
            self.message = ''

    def toggle_layer(self, name): self.layers[name] = not self.layers[name]

    def toggle_motion(self):
        self.reduced = not self.reduced
        if self.reduced:
            self.drawing_until = 0
            self.board_motion = None
            self.roll_start = 0
            self.fx_rows.clear()
            self.metric_start = 0

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
        self.button(15, 193, 215, 27, '동작 줄이기 ' + ('ON' if self.reduced else 'OFF'), self.toggle_motion)
        self.button(15, 158, 215, 27, 'F5 상태 JSON 저장', self.save)
        if self.diagnostics:
            self.button(15, 121, 215, 27, '단계 진단: 적 턴만 실행', lambda: self.diagnostic_step('enemy'), bool(self.game.state['pieces']))
            self.button(15, 89, 215, 27, '단계 진단: 마스터 1틱', lambda: self.diagnostic_step('master'), bool(self.game.state['pieces']))
        else: self.lines(15, 130, 'SPACE 진행 / R 교체 / 1~6 손패 / ESC 종료', 17)
        self.text(15, 55, '진단도구' if self.diagnostics else 'pico2d run-test', GOLD)

    def draw_hover_path(self, path):
        points = [self.xy(self.game.active()['pos'])] + [self.xy(step['pos']) for step in path]
        for index, ((ax, ay), (bx, by)) in enumerate(zip(points, points[1:])):
            length = math.hypot(bx - ax, by - ay)
            if not length: continue
            dx, dy = (bx - ax) / length, (by - ay) / length
            end = length
            if index == len(points) - 2:
                end = max(1, length - 21)
                tip_x, tip_y = ax + end * dx, ay + end * dy
                for side in (-1, 1):
                    self.p.draw_line(round(tip_x), round(tip_y),
                                     round(tip_x - 8 * dx - side * 4 * dy),
                                     round(tip_y - 8 * dy + side * 4 * dx), *GOLD)
            for start in range(0, math.ceil(end), 9):
                stop = min(start + 4, end)
                self.p.draw_line(round(ax + start * dx), round(ay + start * dy),
                                 round(ax + stop * dx), round(ay + stop * dy), *GOLD)

    def draw_board(self, layers):
        motion = self.board_motion
        travel_xy = None
        landing = 0
        if motion:
            points = motion['points']
            elapsed = time.monotonic() - motion['start']
            travel = (len(points) - 1) * motion['step']
            if self.edit or self.reduced or elapsed >= travel + .14:
                self.board_motion = None
            elif elapsed < travel:
                for layer in ('pieces', 'bosses', 'specials'):
                    if layer in layers: layers[layer] = motion['before'][layer]
                step = min(int(elapsed / motion['step']), len(points) - 2)
                t = min(1, elapsed / motion['step'] - step)
                eased = t * t * (3 - 2 * t)
                (ax, ay), (bx, by) = points[step:step + 2]
                travel_xy = round(ax + (bx - ax) * eased), round(ay + (by - ay) * eased + 4 * math.sin(math.pi * t))
            else:
                landing = 1 - (elapsed - travel) / .14

        if 'board' in layers:
            for route in layers['board']['paths'].values():
                for a, b in zip(route, route[1:]): self.p.draw_line(*self.xy(a), *self.xy(b), 90, 104, 128)
            landmarks = {'0': '출발', 'C': '중앙', 'G': '관문', 'END': '완주'}
            loss_nodes = self.game.data['normalTiles']['lossNodes']
            for n in layers['board']['nodes']:
                pos = n['id']
                x, y = self.xy(pos)
                radius = 13 if n.get('tag') else 10
                self.box(x - radius, y - radius, 2 * radius, 2 * radius, (75, 87, 110))
                if pos in loss_nodes:
                    self.box(x - 4, y - 1, 8, 2, RED)
                label = pos if self.edit or self.diagnostics else landmarks.get(pos)
                if label: self.text(x - 10, y - 24, label, MUTED)
        if 'specials' in layers:
            for t in layers['specials']:
                x, y = self.xy(t['pos']); effect = next(v for v in self.game.data['specialTiles'] if v['id'] == t['type'])
                self.box(x - 15, y - 15, 30, 30, (100, 80, 38)); self.text(x - 12, y - 5, effect['symbol'], GOLD)
        if 'bosses' in layers:
            for b in layers['bosses']:
                x, y = self.xy(b['pos']); self.box(x - 18, y - 18, 36, 36, (135, 45, 62))
                cell = self.combat_art.h
                self.combat_art.clip_draw(cell, 0, cell, cell, x, y, 32, 32)
                self.text(x - 18, y + 25, str(b['hp']), RED)
        if layers.get('path'): self.draw_hover_path(layers['path'])
        active = self.game.active()
        if 'pieces' in layers:
            for unit in layers['pieces']:
                moving = travel_xy is not None and unit['id'] == motion['moving_id']
                x, y = travel_xy if moving else self.piece_xy(unit)
                self.box(x - 17, y - 17, 34, 34, (35, 130, 116))
                label = ''.join('ABCD'[i] for i in unit['ids'])
                self.text(x - 4 * len(label), y, label)
                if active and active['id'] == unit['id']:
                    self.box(x - 18, y - 18, 36, 36, GOLD, False)
        if landing and 'fx' in layers:
            x, y = points[-1]
            radius = 19 + round((1 - landing) * (4 + 3 * motion['strength']))
            color = tuple(round(bg + landing * (fg - bg)) for bg, fg in zip((20, 25, 36), motion['color']))
            self.box(x - radius, y - radius, radius * 2, radius * 2, color, False)
        self.text(280, 825, ('확장 외곽 28칸' if self.game.row['type'] == 'boss' else '일반 외곽 20칸') + ' / 특수칸 ' + str(len(self.game.plan_now()['tiles'])), GOLD)
        living_ids = {i for group in self.game.living() for i in group['ids']}
        for i in range(4):
            selected = active and i in active['ids']
            label = '말 ' + 'ABCD'[i] + (' · 선택됨' if selected else ' 선택')
            enabled = i in living_ids and not self.edit and self.game.state['phase'] in ('DRAW', 'REVEAL', 'SELECT')
            self.button(275 + i * 145, 263, 135, 30, label, lambda i=i: self.choose_piece(i), enabled)

    def choose_piece(self, index):
        if self.edit or self.game.state['phase'] not in ('DRAW', 'REVEAL', 'SELECT'): return
        group = next((g for g in self.game.living() if index in g['ids']), None)
        if group is not None:
            self.board_motion = None
            self.game.state['active'] = group['id']
            self.game.touch()

    def cycle_forced(self):
        values = [None] + list(self.game.hands); s = self.game.state
        current = next_player_hand(self.game)
        s['practice_fixed'] = False
        s['forced'] = values[(values.index(current) + 1) % len(values)]

    def edit_unit(self):
        units = self.game.state['pieces'] + self.game.state['guards']
        return units[self.edit_index % len(units)]

    def adjust(self, key, delta):
        unit = self.edit_unit(); value = unit.get(key, 0) + delta
        self.game.edit_unit(unit, **{key: round(value, 3)})
        self.reset_score_feedback()

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
        self.board_motion = None
        self.key_route = None
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
        self.button(900, 278, 350, 30, '다음 라운드 리스크 선택', g.advance_round, len(s['deck']) >= g.rules['minDeckSize'])

    def reroll(self):
        s = self.game.state; e = self.game.data['economy']; cost = e['rerollBase'] + s['rerolls'] * e['rerollStep']
        if s['phase'] == 'SHOP' and s['coins'] >= cost:
            s['coins'] -= cost; s['rerolls'] += 1; self.game.roll_shop(); self.game.touch()

    def right_panel(self):
        g, s = self.game, self.game.state
        phase_names = dict(DRAW='드로우', REVEAL='손패 공개', SELECT='윷 선택', MOVE='갈림길',
                           REWARD='라운드 보상', PREP='출전 준비', CHOICE='다음 행선지', TRAIT='리스크 선택',
                           SHOP='상점', WIN='승리', LOSE='패배')
        show_field = s['phase'] in ('DRAW', 'REVEAL', 'SELECT', 'MOVE')
        self.text(900, 795, phase_names[s['phase']] + (' · ' + g.field()['name'] if show_field else ''), GOLD)
        if self.edit and s['pieces']: self.editor_panel(); return
        if s['phase'] == 'MOVE':
            self.text(900, 773, '1·2 경로 보기  /  Enter 이동  /  Esc 미리보기 닫기', MUTED)
            for i, route in enumerate(g.route_options()):
                projection = self.preview_route(route); y = 675 - i * 100
                title = f'{i + 1}  ' + ('지름길' if i else '현재 길') + ' → ' + str(projection['arrival'] or '대기') + ' 이동'
                hot = self.button(900, y, 350, 33, title, lambda route=route: self.move(route))
                if self.key_route == route or (self.key_route is None and hot):
                    self.hover_path = projection
                    self.box(900, y, 350, 33, GOLD, False)
                self.text(900, y + 59, '칸 ' + str(len(projection['path'])) + ' / W ' + str(projection['before']) + ' → ' + str(projection['after']), MUTED)
                self.text(900, y + 39, '예상 정산 +' + str(projection['score_gain']) + ' / 전투 ' + str(len(projection['state']['events'])), MUTED)
        elif s['phase'] in ('PREP', 'REWARD'):
            ready = s['phase'] == 'REWARD' or len(s['deck']) >= g.rules['minDeckSize']
            title = ('이 덱으로 출전' if s['phase'] == 'PREP' else f"보상 수령  +{s['reward']['total']}냥")
            self.button(900, 735, 350, 36, title, self.primary, ready)
            return
        elif s['phase'] in ('DRAW', 'REVEAL', 'SELECT'):
            forced = next_player_hand(g)
            label = '체험 투척' if forced and s.get('practice_fixed') else '플레이어 투척'
            self.button(900, 689, 350, 31, label + ' · ' + (g.hands[forced]['name'] if forced else '난수'), self.cycle_forced)
            if s['phase'] == 'SELECT' and len(s['selected']) == 4:
                odds = g.outcomes(s['selected'])
                self.lines(900, 625, ' / '.join(g.hands[k]['name'] + ' ' + str(round(v['probability'] * 100)) + '%' for k, v in odds.items()), 32)
        elif s['phase'] == 'CHOICE':
            self.button(900, 735, 350, 35, '상점 입장', g.enter_shop)
            self.button(900, 690, 350, 35, '상점 건너뛰기 / 추가 이자 +' + str(g.interest()), lambda: g.advance_round(True))
            return
        elif s['phase'] == 'TRAIT':
            for i, key in enumerate(s['risk_offers']):
                risk = next(row for row in g.data['riskChoices'] if row['id'] == key)
                y = 745 - i * 116
                self.button(900, y, 350, 34, risk['name'], lambda key=key: g.set_risk(key))
                self.text(908, y - 17, f"목표 {math.floor(g.row['target'] * risk['targetX'] + .5):,}점   /   기본 보상 ×{risk['rewardX']:g}", GOLD)
                self.lines(908, y - 40, risk['effect'], 24)
            return
        elif s['phase'] == 'SHOP':
            self.button(900, 752, 350, 28, '상품 / 빌드 관리 전환', lambda: setattr(self, 'shop_services', not self.shop_services))
            if self.shop_services: self.shop_management(); return
            for i, offer in enumerate(s['shop']):
                product = g.product(offer); y = 690 - i * 75
                self.text(900, y + 47, product['name'] + ' / ' + str(g.price(product['price'])) + '냥', GOLD)
                label = '구매 완료' if offer['sold'] else ('구매 · 대상 말 ' + 'ABCD'[self.target] if offer['kind'] == 'pieceTrait' else '구매')
                self.button(900, y + 4, 350, 31, label, lambda i=i: g.buy(i, self.target), not offer['sold'] and s['coins'] >= g.price(product['price']))
            self.button(900, 496, 170, 28, '구매 대상 ' + 'ABCD'[self.target], lambda: setattr(self, 'target', (self.target + 1) % 4))
            self.button(1080, 496, 170, 28, '상품 다시 뽑기', self.reroll)
            for i in range(4): self.button(900 + (i % 2) * 177, 455 - (i // 2) * 35, 170, 30, '말 ' + 'ABCD'[i] + ' 강화 Lv' + str(s['templates'][i]['level']), lambda i=i: g.upgrade_piece(i))
            self.button(900, 375, 350, 30, '다음 라운드 리스크 선택', g.advance_round, len(s['deck']) >= g.rules['minDeckSize'])
            return
        else:
            self.text(900, 741, '런 완료' if s['phase'] == 'WIN' else '런 종료', GOLD, True)
            self.button(900, 680, 350, 35, '같은 시드로 다시 시작', lambda: self.scene('play'))
        y = 565 if s['phase'] != 'MOVE' else 445
        if s['events']:
            e = s['events'][-1]
            outcome = '격파' if e['boss_after'] == 0 else ('아군 전멸' if e['player_after'] == 0 else '생존')
            cell = self.combat_art.h
            self.combat_art.clip_draw(0, 0, cell, cell, 1120, y - 42, 67, 67)
            self.combat_art.clip_draw(cell, 0, cell, cell, 1207, y - 42, 67, 67)
            self.text(900, y, f"{e['boss']} · {outcome}", GREEN if e['boss_after'] == 0 else RED, True)
            self.text(900, y - 32, f"말 {e['group']} HP  {e['player_before']} → {e['player_after']}")
            self.text(900, y - 56, f"상대 HP  {e['boss_before']} → {e['boss_after']}", GOLD)
            if e.get('survivors') and e['survivors'] != e['group']:
                self.text(900, y - 80, '전투 후 생존 · 말 ' + e['survivors'], GREEN)
            y -= 110
        for boss in s['guards']:
            if boss['role'] != 'extra': continue
            self.text(900, y, boss['name'] + ' @' + boss['pos'] + ' HP ' + str(boss['hp']), RED); y -= 20
            target = '미발견' if boss['targetPieceId'] is None else 'ABCD'[boss['targetPieceId']] + ' 추적'
            roll = g.hands[boss['lastRoll']]['name'] if boss['lastRoll'] in g.hands else '아직 투척 전'
            self.text(900, y, f"시야 {boss['visionRange']} / {target} / {roll}", MUTED); y -= 25

    def hand_panel(self):
        g, s = self.game, self.game.state
        if s['phase'] in ('SHOP', 'PREP'):
            items = s['collection']; pages = max(1, (len(items) + 7) // 8); self.inventory_page %= pages
            self.button(275, 216, 140, 26, '보유함 이전', lambda: setattr(self, 'inventory_page', self.inventory_page - 1), self.inventory_page > 0)
            self.button(425, 216, 140, 26, '보유함 다음', lambda: setattr(self, 'inventory_page', self.inventory_page + 1), self.inventory_page + 1 < pages)
            self.text(590, 226, f"출전 {len(s['deck'])}/{s['capacity']}장   ·   보유함 {self.inventory_page + 1}/{pages}쪽")
            for i, item in enumerate(items[self.inventory_page * 8:self.inventory_page * 8 + 8]):
                uid = item['uid']; x = 275 + i * 122
                equipped = uid in s['deck']
                self.button(x, 150, 115, 55, ('[출전] ' if equipped else '[보관] ') + g.sticks[item['type']]['name'][:6], lambda uid=uid: g.toggle_deck(uid), not self.edit and (equipped or len(s['deck']) < s['capacity']))
                self.text(x, 135, f"#{uid}   Lv {item['level']}")
                if s['phase'] == 'SHOP':
                    self.button(x, 96, 115, 26, '강화', lambda uid=uid: g.upgrade_stick(uid))
                    self.button(x, 63, 55, 26, '삭제', lambda uid=uid: g.remove_stick(uid))
                    self.button(x + 60, 63, 55, 26, '판매', lambda uid=uid: g.remove_stick(uid, True))
            return
        phase = s['phase']
        if phase not in ('DRAW', 'REVEAL', 'SELECT', 'MOVE'): return
        deck_x, deck_y, deck_w, deck_h = 1150, 64, 92, 138
        self.box(269, 39, 986, 169, (23, 53, 53))
        for offset in (6, 3, 0):
            self.box(deck_x + offset, deck_y - offset, deck_w, deck_h, (47, 67, 65))
            self.box(deck_x + offset, deck_y - offset, deck_w, deck_h, (192, 166, 111), False)
        self.card_back.draw(deck_x + deck_w // 2, deck_y + deck_h // 2, deck_w, deck_h)
        draw = phase == 'DRAW'
        if draw and not self.edit:
            self.buttons.append((deck_x, deck_y - 25, deck_w + 6, deck_h + 25, self.primary))
        self.text(deck_x - 2, deck_y - 17, ('뽑기' if draw else '윷 덱') + f" · {len(s['draw'])}장", GOLD)
        picked = len(s['selected'])
        self.text(277, 231, f"손패 {len(s['hand'])}장   ·   선택 {picked}/4", INK)
        if draw:
            self.text(881, 231, '오른쪽 아래 덱을 눌러 뽑기   [Space]', GOLD)
        if phase in ('REVEAL', 'SELECT'):
            title = '손패 공개' if phase == 'REVEAL' else f'선택한 윷 던지기  {picked}/4'
            ready = (phase != 'REVEAL' or time.monotonic() >= self.drawing_until) and (phase != 'SELECT' or picked == 4)
            self.button(1010, 215, 233, 32, title + '   [Space]', self.primary, ready and not self.edit)
        if phase == 'SELECT':
            self.button(785, 215, 214, 32, f"선택 윷 교체   [R] · {s['swaps']}회", g.swap, bool(picked and s['swaps']) and not self.edit)
        w, h, gap = 109, 140, 12
        hand_width = (w + gap) * len(s['hand']) - gap
        for i, uid in enumerate(s['hand']):
            selected = uid in s['selected']
            x = 703 - hand_width // 2 + i * (w + gap)
            y = 50 + round(6 - 2 * abs(i - (len(s['hand']) - 1) / 2)) + (12 if selected else 0)
            item = g.item(uid); stick = g.sticks[item['type']]
            fresh = uid in s['last_draw']
            concealed = phase == 'REVEAL' and fresh
            if concealed:
                order = s['last_draw'].index(uid)
                end = self.drawing_until - DEAL_STAGGER * (len(s['last_draw']) - 1 - order)
                left = 0 if self.reduced else max(0., min(1., (end - time.monotonic()) / DEAL_FLIGHT)) ** 2
                cx = round((x + w / 2) * (1 - left) + (deck_x + deck_w / 2) * left)
                cy = round((y + h / 2) * (1 - left) + (deck_y + deck_h / 2) * left)
                self.card_back.draw(cx, cy, round(w + (deck_w - w) * left), round(h + (deck_h - h) * left))
                continue
            can_pick = phase == 'SELECT' and not self.edit and (selected or picked < 4)
            if can_pick:
                self.buttons.append((x, y, w, h, lambda uid=uid: g.select(uid)))
            self.box(x + 3, y - 4, w, h, (11, 29, 31))
            self.box(x, y, w, h, (244, 229, 196))
            self.box(x, y, w, h, GOLD if selected else (156, 144, 109), False)
            dark = (51, 46, 40)
            self.box(x, y + h - 24, w, 24, (31, 103, 88) if selected else (64, 76, 70))
            self.text(x + 6, y + h - 12, f"{i + 1}   " + ('선택됨' if selected else ('새 윷' if fresh else '남은 윷')), INK)
            cell = self.stick_art.h
            special = item['type'] not in ('wood', 'marked')
            self.stick_art.clip_draw(cell if stick.get('marked') else 0, 0, cell, cell,
                                     x + w // 2, y + 83, 62, 62)
            if special:
                self.box(x + 2, y + 27, w - 4, 28, (34, 93, 100))
            upgrade = f" +{item['level']}" if item['level'] else ''
            self.text(x + 8, y + 42, stick['name'] + upgrade, INK if special else dark)
            self.text(x + 6, y + 17, f"배 {stick['pFlat']:.0%}  +{stick['chips']}점", dark)

    def roll_panel(self):
        g, s = self.game, self.game.state
        if self.edit or s['phase'] not in ('DRAW', 'REVEAL', 'SELECT', 'MOVE', 'REWARD', 'LOSE'): return
        detail = s.get('roll_detail')
        if not detail:
            self.text(686, 748, '이번 라운드 목표', GOLD)
            self.text(686, 713, f"{s['target']:,}점", INK, True)
            self.lines(686, 678, '말을 업어 점수를 키우고\n완주해서 정산하세요.', 16)
            return
        hand = g.hands[s['last_roll']]
        self.box(681, 536, 188, 228, (28, 35, 48))
        self.text(693, 746, f"{detail['turn']}턴 투척 결과", GOLD)
        distance = '뒤로 1칸' if hand['move'] < 0 else f"{detail.get('steps', hand['move'])}칸"
        if detail.get('stationary_fight'): distance = '제자리'
        elif detail.get('skipped'): distance = '이동 없음'
        self.text(693, 714, '낙' if detail.get('fall') else f"{hand['name']}  ·  {distance}", INK, True)
        age = time.monotonic() - self.roll_start
        for i, (uid, face) in enumerate(zip(detail['items'], detail['faces'])):
            x = 694 + i * 43
            t = max(0., min(1., (age - i * .025) / .18))
            y = 636 if self.reduced else 636 + round(7 * math.sin(math.pi * t))
            flat = face == 'flat'
            self.box(x, y, 31, 44, (210, 180, 128) if flat else (94, 69, 53))
            self.text(x + 8, y + 22, '배' if flat else '등', (35, 31, 31) if flat else INK)
            if g.sticks[g.item(uid)['type']].get('marked'):
                self.text(x, 621, '표시', GOLD)
        if 'value' in detail:
            pos = detail['arrival']
            dest = {None: '대기', 'J': '귀환', 'G': '관문', 'END': '완주'}.get(pos, pos)
            location = f"{dest} 제자리 교전" if detail.get('stationary_fight') else f"{dest} 도착"
            self.text(693, 598, f"말 {detail['group']} · {location}")
            value = detail['value']
            self.text(693, 575, f"{value['n']:,} × {value['m']:g} × {value['x']:.2f}", MUTED)
            self.text(693, 552, f"윷 성장 +{value['gain']:,}", GREEN)
        else:
            self.text(693, 598, detail.get('skipped', '이동 경로를 고르세요.'), MUTED)

    def metrics(self):
        s = self.game.state
        if s['phase'] in ('CHOICE', 'REWARD', 'TRAIT', 'PREP', 'SHOP'):
            self.text(275, 862, '윷토체스 pico2d · ' + self.game.row['id'], GOLD)
            self.text(560, 862, f"잔액 {s['coins']}냥", INK, True)
            self.text(850, 862, f"예상 이자 +{self.game.interest()}냥", GOLD)
            return
        live = sum(self.game.weight(g) for g in self.game.living()); t = time.monotonic() - self.metric_start
        anim = not self.reduced and 0 <= t < .6 and self.metric_after == live
        progress = 1 - (1 - t / .6) ** 3 if anim else 1
        shown = round(self.metric_before + (live - self.metric_before) * progress) if anim else live
        settled = round(self.settled_before + (s['score'] - self.settled_before) * progress) if anim else s['score']
        event = self.score_event(); lift = shake = 0; color = GREEN
        if event:
            phase = (time.monotonic() - event['start']) / .6; wave = math.sin(phase * math.pi)
            color = RED if event['delta'] < 0 else GREEN
            lift = wave * (-6 if event['delta'] < 0 else 6)
            shake = math.sin(phase * math.pi * 4) * 3 if event['source'] == '전투' else 0
            x, width = (840, 425) if event.get('metric') == 'settled' else (550, 285)
            for inset in range(3): self.box(x + inset, 832 + inset, width - inset * 2, 55 - inset * 2, color, False)
            self.text(560, 838, event['source'] + ' ' + format(event['delta'], '+,'), color)
        self.text(275, 862, '윷토체스 pico2d · ' + self.game.row['id'], GOLD)
        live_event = event and event.get('metric', 'live') == 'live'
        settled_event = event and event.get('metric') == 'settled'
        self.text(560 + (shake if live_event else 0), 862 + (lift if live_event else 0), '보유 ' + format(shown, ','), color if live_event else GREEN, True)
        self.text(850 + (shake if settled_event else 0), 868 + (lift if settled_event else 0), '완주 ' + str(settled) + ' / 목표 ' + str(s['target']), color if settled_event else INK)
        self.text(850, 844, '투척 ' + str(s['tosses']) + ' / 교체 ' + str(s['swaps']) + ' / ' + str(s['coins']) + '냥 / 이자 ' + str(self.game.interest()))

    def draw_score_effect(self):
        event = self.score_event()
        if not self.effects or not self.sprite or not event: return
        t = time.monotonic() - event['start']; delta = event['delta']
        power = 3 if abs(delta) >= 1000 else 2 if abs(delta) >= 100 else 1
        lift = math.sin(t / .6 * math.pi) * (-3 * power if delta < 0 else 3 * power)
        self.sprite.opacify(max(0, math.sin(t / .6 * math.pi) * .6)); size = 50 + 30 * power * t / .6
        x = 1010 if event.get('metric') == 'settled' else 650
        self.sprite.composite_draw(t * (-1 if delta < 0 else 1), '', x, 855 + lift, size, size)

    def save(self):
        payload = dict(kind='yutochess-pico2d-diagnostic', dataVersion=self.game.data['version'], layers=self.layers, state=self.game.state)
        (ROOT / 'saved-scene.json').write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
        self.message = 'saved-scene.json 저장 완료 (pico2d 전용 진단 스냅샷)'

    def between_rounds(self):
        g, s = self.game, self.game.state
        phase = s['phase']
        self.box(275, 344, 588, 444, (24, 45, 47))
        if phase == 'REWARD':
            r = s['reward']
            self.text(300, 740, f"{g.row['id']} 완주 정산", GOLD, True)
            self.text(300, 678, f"{s['score']:,}점  /  목표 {s['target']:,}점", INK, True)
            self.text(300, 636, f"목표 초과  +{r['overflow']:,}점", GREEN)
            if s['roll_detail'] and s['roll_detail'].get('arrival') == 'END':
                self.text(490, 636, f"말 {s['roll_detail']['group']} 완주", INK)
            for i, (name, key) in enumerate([('기본 보상', 'base'), ('남은 투척', 'remaining'), ('이자', 'interest'), ('초과 점수 보너스', 'bonus')]):
                y = 577 - i * 36
                self.text(300, y, name); self.text(665, y, f"+{r[key]}냥", GOLD)
            self.text(300, 400, f"받을 금액  {r['total']}냥     ·     잔액 {s['coins']} → {s['coins'] + r['total']}냥", GOLD, True)
        elif phase == 'CHOICE':
            self.text(300, 740, f"보상 +{s['reward']['total']}냥 수령", GOLD, True)
            self.text(300, 683, f"현재 {s['coins']}냥", INK, True)
            self.text(300, 616, '상점에서 윷을 사거나, 상점을 건너뛰어 추가 이자를 받으세요.')
        elif phase == 'TRAIT':
            self.text(300, 740, f"{g.row['id']} 리스크 선택", GOLD, True)
            self.text(300, 675, '오른쪽 세 조건 중 하나를 고르세요.')
            self.text(300, 626, '선택한 목표 점수와 보상 배율은 이번 라운드에 적용됩니다.', MUTED)
        else:
            self.text(300, 740, '다음 출전 덱' if phase == 'SHOP' else g.row['id'] + ' 출전 준비', GOLD, True)
            self.text(300, 676, f"출전 {len(s['deck'])} / {s['capacity']}장     ·     보유 {len(s['collection'])}장", INK, True)
            self.text(300, 620, '아래 [출전] 윷을 눌러 빼고 [보관] 윷을 눌러 넣으세요.')
            self.text(300, 580, f"최소 {g.rules['minDeckSize']}장이 필요합니다.", MUTED)
            if phase == 'SHOP':
                offer = next((o for o in s['shop'] if o['kind'] == 'stick'), None)
                if offer:
                    stick = g.product(offer)
                    self.text(300, 500, f"{stick['name']}   ·   배 {stick['pFlat']:.0%}   ·   기본점수 +{stick['chips']}", GOLD)
                    self.lines(300, 465, stick['effect'], 36)
                    uid = offer.get('uid')
                    slot = next((i for i, item in enumerate(s['collection']) if item['uid'] == uid), None)
                    if slot is not None:
                        self.text(300, 400, f"구매한 윷   #{uid}   ·   보유함 {slot // 8 + 1}쪽", GREEN)
            if phase == 'PREP':
                self.text(300, 482, f"{s['risk']['name']}   ·   목표 {s['target']:,}점", GOLD)

    def render(self):
        if self.metric_round != self.game.state['round']: self.reset_score_feedback()
        self.buttons = []; self.hover_path = None
        self.p.clear_canvas(); self.box(0, 0, W, H, (20, 25, 36))
        finishing = self.game.state['phase'] == 'REWARD' and self.board_motion is not None
        self.sidebar()
        if not finishing:
            self.right_panel()
        between = self.game.state['phase'] in ('REWARD', 'CHOICE', 'TRAIT', 'PREP', 'SHOP') and not self.edit and not finishing
        layers = visible_layers(snapshot_layers(self.game, self.hover_path), self.layers)
        if 'fx' in layers and not between: self.draw_score_effect()
        if 'ui' in layers:
            self.metrics(); self.hand_panel()
            if between:
                self.between_rounds()
            else:
                self.roll_panel()
                feedback = ' / '.join(r['source'] + ' ' + format(r['delta'], '+,') for r in self.game.state['feedback'])
                self.text(275, 25, feedback[:80], GOLD)
        if not between:
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
            self.card_back = p.load_image(str(ROOT / 'assets/yut-card-back.png'))
            self.stick_art = p.load_image(str(ROOT / 'assets/yut-sticks.png'))
            self.combat_art = p.load_image(str(ROOT / 'assets/yut-combat.png'))
            try: self.sprite = p.load_image(str(ROOT / 'assets/score-burst.png'))
            except (OSError, IOError): self.message = '점수 이미지 로드 실패: 숫자 효과로 진행합니다.'
            running = True
            while running:
                for event in p.get_events():
                    if event.type == p.SDL_QUIT: running = False
                    elif event.type == p.SDL_MOUSEMOTION:
                        self.mouse = (event.x, H - 1 - event.y)
                        self.key_route = None
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
                            if event.key == p.SDLK_ESCAPE:
                                if self.game.state['phase'] == 'MOVE' and (self.key_route or self.hover_path):
                                    self.key_route = ''
                                    self.hover_path = None
                                else: running = False
                            elif event.key == p.SDLK_SPACE: self.primary()
                            elif event.key == p.SDLK_r and not self.edit: self.game.swap()
                            elif event.key == p.SDLK_F5: self.save()
                            elif event.key == p.SDLK_RETURN and not self.edit and self.key_route and self.game.state['phase'] == 'MOVE':
                                self.move(self.key_route)
                            elif not self.edit and ord('1') <= event.key <= ord('6'):
                                i = event.key - ord('1')
                                if self.game.state['phase'] == 'MOVE':
                                    options = self.game.route_options()
                                    if i < len(options): self.key_route = options[i]
                                elif i < len(self.game.state['hand']): self.game.select(self.game.state['hand'][i])
                        except (ValueError, KeyError) as error: self.message = str(error)
                self.render(); p.delay(.01)
        finally: p.close_canvas()
