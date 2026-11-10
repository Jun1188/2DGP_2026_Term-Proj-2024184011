"""Renderer-neutral layer data for visual and headless diagnostics."""
from copy import deepcopy

LAYER_NAMES = ('board', 'pieces', 'bosses', 'specials', 'path', 'ui', 'fx')

def snapshot_layers(game, projection=None):
    s = game.state
    return deepcopy(dict(
        board=dict(nodes=[n for n in game.board['nodes'] if not n.get('aliasOf')], paths=game.board['drawPaths']),
        pieces=[dict(id=g['id'], ids=g['ids'], pos=g['pos'], name=game.name(g), weight=game.weight(g)) for g in game.living()],
        bosses=[b for b in s['guards'] if b['hp'] > 0],
        specials=game.plan_now()['tiles'],
        path=projection['path'] if projection else [],
        ui=dict(phase=s['phase'], score=s['score'], target=s.get('target', 0), coins=s['coins'], turn=s['turn']),
        fx=s['feedback']))

def visible_layers(snapshot, enabled):
    return {key: value for key, value in snapshot.items() if enabled.get(key, True)}
