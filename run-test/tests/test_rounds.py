import unittest
from tests.helpers import scene
from engine import Game

class RoundTests(unittest.TestCase):
    def test_all_nine_rounds_have_correct_board_and_tile_counts(self):
        expected = [2, 3, 5, 3, 4, 6, 4, 5, 7]
        normal_size = len(Game().data['board']['routes']['outer'])
        for index, count in enumerate(expected):
            with self.subTest(round=index):
                g = scene('round:' + str(index)); big = index % 3 == 2
                self.assertEqual(len(g.board['routes']['outer']), normal_size + (8 if big else 0))
                for plan in g.state['master']['plans']: self.assertEqual(len(plan['tiles']), count)
                self.assertEqual(g.board['routes']['outer'][-3:], ['J', 'G', 'END'])

    def test_first_round_has_no_mobile_bosses(self):
        for risk in Game().data['riskChoices']:
            with self.subTest(risk=risk['id']):
                g = Game(); g.start(risk=risk['id'])
                self.assertEqual(len(g.state['guards']), 2)

    def test_big_round_pulse_excludes_waiting_pieces(self):
        for index, damage in [(2, 5), (5, 10), (8, 15)]:
            with self.subTest(round=index):
                g = scene('round:' + str(index)); g.place(g.active(), '1')
                for plan in g.state['master']['plans']: plan['roundTraitId'] = 'calm'
                a, b = g.state['pieces'][:2]; before_a, before_b = a['hp'], b['hp']
                g.state['turn'] = 3; g.master_phase()
                self.assertEqual(a['hp'], before_a - damage); self.assertEqual(b['hp'], before_b)

    def test_target_and_boss_growth_increase(self):
        targets, weights = [], []
        for i in range(9):
            g = scene('round:' + str(i)); targets.append(g.state['target']); weights.append(g.state['guards'][1]['weight'])
        self.assertEqual(targets, sorted(targets)); self.assertEqual(weights, sorted(weights))
