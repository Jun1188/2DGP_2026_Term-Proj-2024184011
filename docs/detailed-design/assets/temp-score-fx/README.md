# 임시 점수 효과 에셋

- 파일: `score-burst.png`
- 생성일: 2026-11-10
- 제작: Codex 내장 `image_gen.imagegen` 이미지 생성 도구. CLI/API 키는 사용하지 않았다. 정확한 모델 ID는 도구가 반환하지 않았다.
- 구성: 투명 배경의 금색 링·반짝임. 중앙이 비어 있어 점수 숫자 뒤에 놓는다. 텍스트·숫자는 이미지에 넣지 않았다.
- 사용: 이 정적 PNG를 코드에서 확대·회전·이동·페이드한다. 증가·감소·큰 획득의 색과 강도는 코드가 결정한다. GIF 또는 프레임별 모션을 생성한 파일은 아니다.
- 보존: 생성 원본은 Codex `generated_images`에 유지하고, 프로젝트 참조용 사본을 이 폴더에 저장했다. 임시 적용이므로 사용자 확인 전 최종 아트로 확정하지 않는다.
- 실행 상태: 이미지 출력의 구성만 확인했다. 빌드·브라우저 실행·게임 테스트·검증기를 실행하지 않았다. 화면 가림·밝기·방향·강도는 사용자가 플레이하며 확인한다.

## 최종 생성 프롬프트

Create one transparent-background game UI VFX asset, a compact golden score-gain burst suitable for a tasteful Korean yut board deckbuilding game. Single centered effect only, no text, no numerals, no letters, no card, no UI frame, no solid background. Stylized hand-painted graphic spark burst: a few angular gold and ivory star sparks, delicate warm gold radial streaks and a broken thin luminous ring, with a LARGE CLEAR OPEN CENTER so a game's changing score number remains readable when this is placed behind it. Crisp clean silhouette, restrained grain, premium flat illustrative game icon style, no characters or objects. Main effect occupies middle 75 percent of a square canvas, outer edges fade completely to transparent, generous transparent margins, glow kept restrained and alpha transparent. It must work as a static sprite which application code can expand, rotate and fade for a 0.4-second score animation. No multiple frames or panels. Produce the image and save a local output file if supported.