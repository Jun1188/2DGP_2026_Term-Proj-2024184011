import unittest
from tests.helpers import scene, ready
from scenes import next_player_hand

class StepTests(unittest.TestCase):
    def test_stack_scene_plays_three_hands_once(self):
        g = scene('stack')
        for expected in ('do', 'geol', 'mo'):
            ready(g, next_player_hand(g))
            self.assertEqual(g.state['last_roll'], expected)
            if expected == 'geol':
                self.assertEqual(len(g.route_options()), 2)
            self.assertTrue(g.commit(g.preview('outer')))
            if expected == 'do':
                self.assertEqual(g.active()['ids'], [0, 1])
        self.assertIsNone(next_player_hand(g))

        g.state['score'] = g.state['target']
        g.finish_turn()
        g.claim_reward()
        g.advance_round(True)
        g.set_risk('standard')
        g.start_round()
        self.assertIsNone(next_player_hand(g))

    def test_scene_forced_hand_and_random_override(self):
        g = scene('stack')
        g.state.update(practice_fixed=False, forced=None)
        self.assertIsNone(next_player_hand(g))
        g.state['forced'] = 'yut'
        self.assertEqual(next_player_hand(g), 'yut')
        self.assertIsNone(next_player_hand(scene('play')))
        self.assertEqual(next_player_hand(scene('hand:geol')), 'geol')
        self.assertEqual(next_player_hand(scene('combat')), 'do')

    def test_shortcut_guardian_survives_then_falls_in_place(self):
        g = scene('stack')
        for turn, route in enumerate(('outer', 'diagA', 'diagA'), 1):
            g.draw_hand()
            g.reveal_hand()
            for uid in g.state['hand'][:4]:
                g.select(uid)
            g.toss(next_player_hand(g))
            if turn == 2:
                self.assertEqual({g.preview(r)['arrival'] for r in g.route_options()}, {'8', 'C'})
            self.assertTrue(g.commit(g.preview(route)))
            if turn == 1:
                self.assertEqual((g.active()['pos'], g.active()['ids']), ('5', [0, 1]))
            else:
                fight = g.state['events'][0]
                self.assertEqual((g.active()['pos'], g.active()['ids']), ('C', [1]))
                self.assertEqual(fight['boss_after'], 87 if turn == 2 else 0)
                self.assertEqual(g.state['roll_detail']['steps'], 3 if turn == 2 else 0)
                self.assertEqual(g.state['roll_detail']['stationary_fight'], turn == 3)
        self.assertEqual(g.state['phase'], 'DRAW')
        self.assertIsNone(next_player_hand(g))

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

    def test_roll_faces_survive_commit_and_next_draw(self):
        g = ready(scene('finish'))
        selected = list(g.state['pending']['items'])
        faces = list(g.state['pending']['faces'])
        projection = g.preview()
        self.assertNotIn('arrival', g.state['roll_detail'])
        self.assertTrue(g.commit(projection))
        result = g.state['roll_detail']
        self.assertEqual((result['items'], result['faces']), (selected, faces))
        self.assertEqual(result['arrival'], 'END')
        self.assertEqual(result['value'], projection['value'])

        g = ready(scene('normal:gain'))
        self.assertTrue(g.commit(g.preview()))
        g.draw_hand()
        self.assertEqual(g.state['roll_detail']['faces'].count('flat'), 1)

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

    def test_default_seed_finishes_and_draws_the_purchased_stick_next_round(self):
        g = scene('play')
        moves = ((0, 0, 'outer'), (1, 0, 'outer'), (2, 0, 'outer'),
                 (3, 3, 'outer'), (3, 0, 'outer'), (1, 0, 'outer'),
                 (1, 4, 'diagA'), (1, 4, 'center'), (1, 0, 'center'))
        for group, exchange, route in moves:
            g.draw_hand()
            g.reveal_hand()
            if exchange:
                for uid in g.state['hand'][:exchange]:
                    g.select(uid)
                g.swap()
                g.draw_hand()
                g.reveal_hand()
            g.state['active'] = group
            for uid in g.state['hand'][:4]:
                g.select(uid)
            self.assertTrue(g.toss())
            self.assertTrue(g.commit(g.preview(route)))

        self.assertEqual((g.state['phase'], g.state['score'], g.state['target']), ('REWARD', 7206, 600))
        self.assertEqual(g.state['reward'], dict(base=3, remaining=2, interest=0, bonus=11, total=16, overflow=6606))
        g.claim_reward()
        self.assertEqual(g.state['coins'], 20)
        g.enter_shop()
        self.assertEqual(g.state['shop'][0]['ref'], 'feather')
        self.assertTrue(g.buy(0))
        self.assertEqual(g.state['coins'], 17)
        new_uid = g.state['collection'][-1]['uid']
        self.assertNotIn(new_uid, g.state['deck'])
        g.toggle_deck(1)
        g.toggle_deck(new_uid)
        g.advance_round()
        self.assertEqual(g.state['risk_offers'], ['allOrNothing', 'safe', 'feast'])
        g.set_risk('safe')
        g.start_round()
        g.draw_hand()
        self.assertEqual((g.row['id'], g.state['target']), ('1-2', 810))
        self.assertEqual(g.state['hand'], [3, new_uid, 4, 8, 5, 6])
        self.assertNotIn(1, g.state['hand'] + g.state['draw'])
        g.reveal_hand()
        for uid in (new_uid, 3, 4, 8):
            g.select(uid)
        self.assertTrue(g.toss())
        self.assertTrue(g.commit(g.preview()))
        result = g.state['roll_detail']
        self.assertEqual((g.state['last_roll'], result['steps'], result['arrival']), ('yut', 5, '5'))

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
        self.assertEqual(g.state['last_draw'], [])
        g.draw_hand(); self.assertEqual(g.state['phase'], 'REVEAL'); self.assertEqual(len(g.state['hand']), 6)
        self.assertEqual(sorted(g.state['hand'] + g.state['draw']), sorted(g.state['deck']))

    def test_gate_finish_settles_once(self):
        g = ready(scene('finish')); p = g.preview(); self.assertEqual(p['state']['phase'], 'REWARD')
        self.assertTrue(g.commit(p)); score = g.state['score']; self.assertGreaterEqual(score, g.state['target'])
        self.assertFalse(g.commit(p)); self.assertEqual(g.state['score'], score)

    def test_last_toss_ends_in_loss_without_finish(self):
        g = ready(scene('failure')); p = g.preview(); self.assertEqual(p['state']['phase'], 'LOSE')
