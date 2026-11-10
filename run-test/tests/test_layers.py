import unittest
from copy import deepcopy
from tests.helpers import scene, ready
from view_model import LAYER_NAMES, snapshot_layers, visible_layers

class LayerTests(unittest.TestCase):
    def test_layers_toggle_without_mutating_game(self):
        g = scene(); before = deepcopy(g.state); layers = snapshot_layers(g)
        for name in LAYER_NAMES:
            with self.subTest(layer=name):
                result = visible_layers(layers, {name: False})
                self.assertNotIn(name, result); self.assertEqual(len(result), 6)
        self.assertEqual(g.state, before)

    def test_snapshot_does_not_alias_state(self):
        g = scene('boss:detect'); layers = snapshot_layers(g)
        layers['bosses'][0]['hp'] = -1
        self.assertGreater(g.state['guards'][0]['hp'], 0)

    def test_board_layer_has_one_physical_start(self):
        nodes = snapshot_layers(scene())['board']['nodes']
        self.assertEqual(sum(n['id'] == '0' for n in nodes), 1)
        self.assertFalse(any(n['id'] == 'J' for n in nodes))

    def test_dead_and_finished_pieces_are_not_drawn(self):
        g = scene(); g.state['pieces'][0]['hp'] = 0; g.cleanup()
        g.state['groups'][0]['pos'] = 'END'
        ids = [i for unit in snapshot_layers(g)['pieces'] for i in unit['ids']]
        self.assertNotIn(0, ids); self.assertNotIn(1, ids)

    def test_preview_path_is_a_separate_layer(self):
        g = ready(scene()); p = g.preview(); layers = snapshot_layers(g, p)
        self.assertEqual(layers['path'], p['path'])
        self.assertEqual(snapshot_layers(g)['path'], [])
