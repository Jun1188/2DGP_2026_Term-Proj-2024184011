"""Separate diagnostic entrypoint. Nothing runs until explicitly invoked."""
import argparse
from pathlib import Path
import json
import sys
import time
import unittest
from engine import Game, ROOT
from scenes import load_scene
from view_model import LAYER_NAMES, snapshot_layers, visible_layers

GROUPS = ('layers', 'features', 'steps', 'rounds')

class ReportResult(unittest.TextTestResult):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs); self.records = []; self.started = {}
    def startTest(self, test):
        self.started[test.id()] = time.perf_counter(); super().startTest(test)
    def record(self, test, status, detail=''):
        self.records.append(dict(case=test.id(), status=status, detail=detail, seconds=round(time.perf_counter() - self.started.get(test.id(), time.perf_counter()), 6)))
    def addSuccess(self, test): super().addSuccess(test); self.record(test, 'pass')
    def addFailure(self, test, err): super().addFailure(test, err); self.record(test, 'fail', self._exc_info_to_string(err, test))
    def addError(self, test, err): super().addError(test, err); self.record(test, 'error', self._exc_info_to_string(err, test))
    def addSkip(self, test, reason): super().addSkip(test, reason); self.record(test, 'skip', reason)
    def addSubTest(self, test, subtest, err):
        super().addSubTest(test, subtest, err)
        self.record(subtest, 'pass' if err is None else 'fail', '' if err is None else self._exc_info_to_string(err, test))

class SelectedRound(unittest.TestCase):
    def __init__(self, index): super().__init__('runTest'); self.index = index
    def id(self): return 'round.' + str(self.index // 3 + 1) + '-' + str(self.index % 3 + 1)
    def runTest(self):
        g = load_scene(Game(), 'round:' + str(self.index)); nodes = {n['id'] for n in g.board['nodes']}
        for path in g.board['routes'].values(): self.assertTrue(set(path) <= nodes)
        self.assertEqual(g.board['routes']['outer'][-3:], ['J', 'G', 'END'])
        self.assertEqual(len(g.plan_now()['tiles']), [2, 3, 5, 3, 4, 6, 4, 5, 7][self.index])
        self.assertTrue(all(b['hp'] > 0 for b in g.state['guards']))
        g.draw_hand(); g.reveal_hand()
        for uid in g.state['hand'][:4]: g.select(uid)
        self.assertTrue(g.toss('do')); p = g.preview(); self.assertIsNotNone(p); self.assertTrue(g.commit(p))
        self.assertIn(g.state['phase'], ('DRAW', 'REWARD', 'LOSE'))

class SelectedLayer(unittest.TestCase):
    def __init__(self, name): super().__init__('runTest'); self.layer = name
    def id(self): return 'layer.' + self.layer
    def runTest(self):
        g = load_scene(Game(), 'boss:combat'); snapshot = snapshot_layers(g)
        self.assertIn(self.layer, snapshot)
        hidden = visible_layers(snapshot, {self.layer: False}); self.assertNotIn(self.layer, hidden)
        self.assertEqual(len(hidden), len(LAYER_NAMES) - 1)
        self.assertIn(self.layer, visible_layers(snapshot, {self.layer: True}))

def flatten(suite):
    for item in suite:
        if isinstance(item, unittest.TestSuite): yield from flatten(item)
        else: yield item

def main():
    parser = argparse.ArgumentParser(description='윷토체스 별도 진단도구')
    parser.add_argument('--group', choices=('all',) + GROUPS, default='all')
    parser.add_argument('--case', default='', help='케이스 이름의 일부로 선택')
    parser.add_argument('--layer', choices=LAYER_NAMES, help='레이어 1개만 진단')
    parser.add_argument('--round', dest='round_id', choices=[str(a) + '-' + str(r) for a in range(1, 4) for r in range(1, 4)])
    parser.add_argument('--list', action='store_true', help='실행하지 않고 케이스 목록 표시')
    parser.add_argument('--visual', action='store_true', help='pico2d 레이어/장면 진단 창')
    parser.add_argument('--scene', default='boss:detect')
    parser.add_argument('--seed', type=int, default=20261109)
    parser.add_argument('--font')
    parser.add_argument('--report', help='JSON 결과 파일 경로. 기본 reports/diagnostics.json')
    args = parser.parse_args()
    if args.layer and args.round_id: parser.error('--layer와 --round는 각각 실행하세요.')
    if args.visual:
        from app import App
        key = 'round:' + str((int(args.round_id[0]) - 1) * 3 + int(args.round_id[2]) - 1) if args.round_id else args.scene
        app = App(key, args.seed, args.font, diagnostics=True)
        if args.layer: app.layers = {k: k == args.layer for k in LAYER_NAMES}
        app.run(); return 0
    if args.round_id:
        cases = [SelectedRound((int(args.round_id[0]) - 1) * 3 + int(args.round_id[2]) - 1)]
    elif args.layer: cases = [SelectedLayer(args.layer)]
    else:
        loader = unittest.TestLoader(); groups = GROUPS if args.group == 'all' else (args.group,)
        cases = [test for group in groups for test in flatten(loader.discover(str(ROOT / 'tests'), pattern='test_' + group + '.py', top_level_dir=str(ROOT)))]
    cases = [test for test in cases if args.case in test.id()]
    if not cases: parser.error('선택한 케이스가 없습니다. --list로 이름을 확인하세요.')
    if args.list:
        for test in cases: print(test.id())
        return 0
    runner = unittest.TextTestRunner(verbosity=2, resultclass=ReportResult)
    result = runner.run(unittest.TestSuite(cases))
    report = Path(args.report).resolve() if args.report else ROOT / 'reports' / 'diagnostics.json'
    report.parent.mkdir(parents=True, exist_ok=True)
    payload = dict(dataVersion=Game().data['version'], group=args.group, layer=args.layer, round=args.round_id, selected=len(cases), run=result.testsRun, failures=len(result.failures), errors=len(result.errors), successful=result.wasSuccessful(), cases=result.records)
    report.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8-sig')
    print('진단 결과:', report)
    return 0 if result.wasSuccessful() else 1

if __name__ == '__main__': sys.exit(main())
