---
name: ux-review
description: 윷토체스 UX, 손패와 갈림길 입력, HUD 피드백과 접근성을 검토할 때 사용하는 Game Studios 프로젝트 스킬. 현재 게임의 포팅·검수 상태를 조회할 때도 이 파일의 근거를 사용할 수 있다.
---

# 윷토체스 UX 검토

Donchitos의 Claude Code Game Studios `ux-review`에서 입력·접근성·기획 정합성과 근거 없는 승인 방지 기준을 선별했다. [고정 원본](https://github.com/Donchitos/Claude-Code-Game-Studios/blob/abc0de79d6ceb0b5d7aa693945849b3937afbe6a/.claude/skills/ux-review/SKILL.md) · [MIT 라이선스](LICENSE)

1. 이번 변경에 해당하는 PRD의 규칙과 화면을 고른다. HTML 게임은 `docs/detailed-design/`, pico2d는 `run-test/`에서 같은 조작의 진입점을 찾는다.
2. 한 턴을 따라 사용자가 고를 수 있는 상태, 손패·분기 예고, 확정과 취소, 행동 후 피드백을 확인한다. 키보드와 포인터에서 길을 잃는 지점, 색만으로 알리는 상태, 반복 입력을 각각 확인한다.
3. 각 판단에 파일·행 또는 실제 플레이 관찰을 연결한다. 미실행 장면은 미평가로 남긴다. 수정이 필요하면 이용자가 겪는 증상과 가장 작은 수정 범위를 적는다.
4. 독립 검토에서는 요청 범위와 판단 근거를 돌려준다. 전체 판정에는 MAJOR REVISION NEEDED, NEEDS REVISION, NOT ASSESSED, APPROVED 순으로 가장 먼저 해당하는 결과를 사용한다. 접근성 기준이나 판단 근거가 빠진 항목은 NOT ASSESSED로 표시한다. 모든 항목을 확인하고 통과했을 때만 전체 APPROVED를 쓴다.
