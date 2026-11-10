"""Run the pico2d prototype. This file is safe to import."""
import argparse
from engine import Game
from scenes import catalog


def main():
    parser = argparse.ArgumentParser(description='윷토체스 pico2d run-test')
    parser.add_argument('--scene', default='stack')
    parser.add_argument('--seed', type=int, default=20261109)
    parser.add_argument('--font', help='한글 TTF 파일 경로')
    parser.add_argument('--list-scenes', action='store_true')
    args = parser.parse_args()
    if args.list_scenes:
        for key, label in catalog(Game().data): print(key, label)
        return
    from app import App
    App(args.scene, args.seed, args.font).run()

if __name__ == '__main__': main()
