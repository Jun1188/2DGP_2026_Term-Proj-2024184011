from engine import Game
from scenes import load_scene

def scene(key='normal:gain'):
    return load_scene(Game(), key)

def ready(game, hand='do'):
    game.draw_hand(); game.reveal_hand()
    ordered = sorted(game.state['hand'], key=lambda uid: not game.sticks[game.item(uid)['type']].get('marked', False))
    for uid in ordered[:4]: game.select(uid)
    game.toss(hand)
    return game
