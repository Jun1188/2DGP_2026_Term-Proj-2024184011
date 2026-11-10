import unittest
from copy import deepcopy
from tests.helpers import scene, ready

class FeatureTests(unittest.TestCase):
    def test_boss_waits_outside_vision_without_rng_consumption(self):
        g = scene('boss:outside'); b = g.state['guards'][2]; old = (b['pos'], g.state['rng'])
        g.enemy_phase()
        self.assertEqual((b['pos'], g.state['rng']), old); self.assertIsNone(b['targetPieceId'])

    def test_boss_detects_at_three_edges(self):
        g = scene('boss:detect'); g.place(g.active(), '2'); b = g.state['guards'][2]
        self.assertEqual(len(g.board_path(b['pos'], '2')) - 1, 3)
        g.enemy_phase(); self.assertEqual(b['targetPieceId'], 0)

    def test_locked_target_is_not_replaced_by_nearer_piece(self):
        g = scene('boss:track'); g.place(g.state['groups'][1], '9'); b = g.state['guards'][2]
        g.enemy_phase(); self.assertEqual(b['targetPieceId'], 0)

    def test_finished_target_is_replaced(self):
        g = scene('boss:combat'); b = g.state['guards'][2]; b['targetPieceId'] = 0
        g.state['groups'][0]['pos'] = 'END'; g.state['pieces'][0]['settled'] = True
        g.place(g.state['groups'][1], '3'); g.enemy_phase(); self.assertEqual(b['targetPieceId'], 1)

    def test_keepers_never_get_enemy_turns(self):
        g = scene('boss:combat'); before = [(b['id'], b['pos']) for b in g.state['guards'][:2]]
        reports = g.enemy_phase()
        self.assertEqual([(b['id'], b['pos']) for b in g.state['guards'][:2]], before)
        self.assertEqual(len(reports), 1)

    def test_boss_strikes_first_and_survivor_counters(self):
        g = scene('boss:combat'); result = g.fight(g.active(), g.state['guards'][2], True)
        self.assertEqual([e['side'] for e in result['events']], ['boss', 'player'])
        self.assertGreater(result['player_after'], 0)

    def test_regular_tile_positive_and_negative_feedback(self):
        for key, delta in [('normal:gain', 10), ('normal:loss', -5)]:
            with self.subTest(scene=key):
                g = ready(scene(key)); p = g.preview()
                rows = [r for r in p['state']['feedback'] if r['source'] == '일반 칸']
                self.assertEqual(rows[0]['delta'], delta)

    def test_all_special_tile_effects(self):
        for kind in ['fortune', 'tax', 'well', 'haste', 'thorns']:
            with self.subTest(tile=kind):
                g = scene('tile:' + kind); p = g.state['pieces'][0]; g.place(g.active(), '5')
                before = deepcopy(p); g.apply_tile(g.active())
                self.assertEqual(g.state['feedback'][-1]['source'], '특수칸')
                if kind == 'fortune': self.assertEqual(p['weight'] - before['weight'], 80)
                if kind == 'tax': self.assertEqual(p['weight'] - before['weight'], -40)
                if kind == 'well': self.assertEqual(p['hp'] - before['hp'], 25)
                if kind == 'haste': self.assertEqual(p['moveBonus'], 1)
                if kind == 'thorns': self.assertLess(p['hp'], before['hp'])

    def test_preview_leaves_state_rng_and_hp_untouched(self):
        g = ready(scene('boss:combat')); before = deepcopy(g.state)
        first, second = g.preview(), g.preview()
        self.assertEqual(first, second); self.assertEqual(before, g.state)
        self.assertTrue(g.commit(first)); self.assertEqual(g.state['rng'], first['state']['rng'])

    def test_stat_edit_preserves_damage(self):
        g = scene(); p = g.state['pieces'][0]; p['hp'] -= 10
        g.edit_unit(p, weight=p['weight'] + 100)
        self.assertEqual(g.stats(p)['maxHp'] - p['hp'], 10)
        with self.assertRaises(ValueError): g.edit_unit(p, healthScale=float('nan'))

    def test_vision_editor_rejects_invalid_values(self):
        g = scene('boss:detect'); b = g.state['guards'][2]; g.edit_unit(b, visionRange=6)
        self.assertEqual(b['visionRange'], 6)
        for value in [-1, 31, 1.5]:
            with self.assertRaises(ValueError): g.edit_unit(b, visionRange=value)

    def test_shop_deducts_money_once(self):
        g = scene('product:stick:wood'); before = g.state['coins']; cost = g.price(g.product(g.state['shop'][0])['price'])
        self.assertTrue(g.buy(0)); self.assertEqual(g.state['coins'], before - cost)
        self.assertFalse(g.buy(0)); self.assertEqual(g.state['coins'], before - cost)

    def test_probability_table_is_normalized_and_read_only(self):
        g = scene('hand:backdo'); g.draw_hand()
        items = sorted(g.state['hand'], key=lambda uid: not g.sticks[g.item(uid)['type']].get('marked', False))[:4]
        before = deepcopy(g.state); odds = g.outcomes(items)
        self.assertAlmostEqual(sum(r['probability'] for r in odds.values()), 1)
        self.assertGreater(odds['backdo']['probability'], 0)
        self.assertEqual(g.state, before)

    def test_capacity_and_trait_management(self):
        g = scene('shop'); old = g.state['capacity']; self.assertTrue(g.expand_capacity())
        self.assertEqual(g.state['capacity'], old + 1)
        self.assertTrue(g.upgrade_deck_trait(0)); self.assertEqual(g.state['deck_traits'][0]['level'], 2)
        g.remove_deck_trait(0); self.assertEqual(g.state['deck_traits'], [])
