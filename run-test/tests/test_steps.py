import unittest
from tests.helpers import scene, ready

class StepTests(unittest.TestCase):
    def test_draw_reveal_select_has_no_automatic_selection(self):
        g = scene(); self.assertEqual(g.state['phase'], 'DRAW')
        g.draw_hand(); self.assertEqual(g.state['phase'], 'REVEAL'); self.assertEqual(g.state['selected'], [])
        g.select(g.state['hand'][0]); self.assertEqual(g.state['selected'], [])
        g.reveal_hand(); self.assertEqual(g.state['phase'], 'SELECT')
        for uid in g.state['hand']: g.select(uid)
        self.assertEqual(len(g.state['selected']), 4)
        uid = g.state['selected'][0]; g.select(uid); self.assertNotIn(uid, g.state['selected'])

    def test_toss_requires_four_and_returns_used_sticks(self):
        g = scene(); g.draw_hand(); g.reveal_hand(); self.assertFalse(g.toss('do'))
        for uid in g.state['hand'][:4]: g.select(uid)
        used = list(g.state['selected']); g.toss('do')
        self.assertEqual(g.state['phase'], 'MOVE')
        self.assertTrue(set(used) <= set(g.state['draw']))
        self.assertEqual(sorted(g.state['hand'] + g.state['draw']), sorted(g.state['deck']))

    def test_commit_rejects_stale_and_double_application(self):
        g = ready(scene()); p = g.preview(); g.edit_unit(g.state['pieces'][0], weight=200)
        self.assertFalse(g.commit(p)); current = g.preview(); self.assertTrue(g.commit(current)); self.assertFalse(g.commit(current))

    def test_reward_choice_shop_and_next_round(self):
        g = scene('reward'); before = g.state['coins']; reward = g.state['reward']['total']
        g.claim_reward(); g.claim_reward(); self.assertEqual(g.state['coins'], before + reward)
        self.assertEqual(g.state['phase'], 'CHOICE'); g.enter_shop(); self.assertEqual(g.state['phase'], 'SHOP')
        g.advance_round(); self.assertEqual(g.state['phase'], 'TRAIT')
        g.set_risk('standard'); self.assertEqual(g.state['phase'], 'PREP')
        g.start_round(); self.assertEqual(g.state['phase'], 'DRAW'); self.assertEqual(g.state['round'], 1)

    def test_skip_shop_grants_one_extra_interest(self):
        g = scene('choice'); before = g.state['coins']; interest = g.interest()
        g.advance_round(True); g.advance_round(True)
        self.assertEqual(g.state['coins'], before + interest); self.assertEqual(g.state['round'], 1)

    def test_boss_and_master_follow_player_move(self):
        g = ready(scene('boss:combat')); p = g.preview()
        self.assertTrue(p['state']['enemies']); self.assertTrue(p['state']['events'][0]['boss_first'])
        self.assertEqual(p['state']['phase'], 'DRAW')

    def test_swap_preserves_unselected_hand_and_refills(self):
        g = scene(); g.draw_hand(); g.reveal_hand(); keep = set(g.state['hand'][2:])
        for uid in g.state['hand'][:2]: g.select(uid)
        g.swap(); self.assertEqual(g.state['phase'], 'DRAW'); self.assertTrue(keep <= set(g.state['hand']))
        g.draw_hand(); self.assertEqual(g.state['phase'], 'REVEAL'); self.assertEqual(len(g.state['hand']), 6)
        self.assertEqual(sorted(g.state['hand'] + g.state['draw']), sorted(g.state['deck']))

    def test_gate_finish_settles_once(self):
        g = ready(scene('finish')); p = g.preview(); self.assertEqual(p['state']['phase'], 'REWARD')
        self.assertTrue(g.commit(p)); score = g.state['score']; self.assertGreaterEqual(score, g.state['target'])
        self.assertFalse(g.commit(p)); self.assertEqual(g.state['score'], score)

    def test_last_toss_ends_in_loss_without_finish(self):
        g = ready(scene('failure')); p = g.preview(); self.assertEqual(p['state']['phase'], 'LOSE')
