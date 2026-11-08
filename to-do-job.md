# 2겜플 할거:  


## 툴, 메타적 작업  
Unit Test (develop/ 브랜치에서 씬 분리 테스트), 
Hub 디버거로 상호테스트 (hub 작동)
게임 SKILL 사용 ()
기흭서 수정ㆍ세부화 


## 개발 구현 루틴  

### 파이프라인 툴 만들기  
박싱 -> 코어루프 & 재미, 밸런스 검증 -> 리소스 제작 루프
최소 기능 (껍데기 루프) -> HUD -> 실제 기능 -> 최소단위 루프  

리소스는 codex 기본 리소스 말고, 
레퍼런스를 컨택스트로 해 gpt-이미지로 일관성 있게 에셋 뽑기 -> 적용 루프 무조건  



### 추상 로직, 렌더패스는 파이썬 피코2D -> 코어ㆍ오버헤드 구현은 C++ & 서버 래핑
(마치 AI 학습에서 파이썬 쓰는 것처럼)  

A*, ECS, OOP, 필요하다면 그런 아키텍처들 적용



## 기획 추가 내용  
를체처럼 PVP 기능 지원 (클라이언트 간 그리드 호스팅 방식), 현재 룰은 PVP, 봇대전으로 이전.
기본 PVE는 발라트로처럼 완주한 말 일정개수 이상 + 유저 점수가 일정 이상이어야 하는 걸 승리 조건으로, 그리고 호스트가 게임 조율하고 방해하는 방식. 레이스 & 트랙 무브먼트 & 룰앤무브. 


봇이랑 PVE는 플레이어 상황, 선택에 따른  균형 행동 트리 기반 A*
로컬 LLM 및 로컬 디시전 모델 혼합 사용,
입력 -> 출력 사이에 다른 단계들을 넣어서 응답 지연 완화 + 성능 스케줄링 최적화





## 레퍼런스 :  


### 디시전 모델   
참고:
https://github.com/deepanwadhwa/OpenDecision




### C. 스킬·도구 저장소(게임·에셋·이미지)

| ID | 저장소 | 상태 | 무엇 | 라이선스 | ★ | 주의 |
|---|---|---|---|---|---|---|
| C1 | https://github.com/MrForExample/ComfyUI-3D-Pack | ✅ | ComfyUI 3D 노드(Hunyuan3D 2.1, TRELLIS 등) | MIT | 3.9k | 일부 노드 VRAM 16 GB+, VS Build Tools 필요, 일부는 HF 토큰 필요 |
| C2 | https://github.com/thedivergentai/Game-Dev-Agentic-Skills | ✅ | Godot 4.7+ 99개, Bevy 0.20+ 82개 스킬 | LGPL-3.0 | 941 | `--all` 금지(컨텍스트 과다) |
| C3 | https://github.com/gamedev-skills/awesome-gamedev-agent-skills | ✅ | 77개 게임개발 스킬 + 엔진 라우터, `create-game-assets` 포함 | Apache-2.0 | 7.7k | Node 22.20+ |
| C4 | https://github.com/patch-gg/pixelfx | ✅ | 코드로 만든 픽셀아트 이펙트 244종 + 스프라이트시트 내보내기, Claude Code 스킬 | MIT(폰트 제외) | 6.0k | 커밋 8개 |
| C5 | https://github.com/Donchitos/Claude-Code-Game-Studios | ✅ | 게임 스튜디오 템플릿(에이전트 49, 스킬 74, 훅 15) | MIT | 36.8k | 통째로 넣지 않는다 |
| C6 | https://github.com/WU-HAOTIAN34/2dimg2motion | ✅ | 2D 이미지 1장 → 투명 14프레임 시트 | MIT | 262 | 이미지 생성 모델 필요 |
| C7 | https://github.com/aldegad/sprite-gen | ✅ | 이미지 → 스프라이트 아틀라스·모션 루프, 큐레이션 웹뷰 | Apache-2.0 | 3.9k | ffmpeg, xAI/OpenAI/Anthropic 로그인 또는 키 |
| C8 | https://github.com/KohakuBlueleaf/PixelOE | ✅ | 결정적 픽셀아트 변환(신경망 없음), ComfyUI 노드 3종 | Apache-2.0 | 575 | CPU 가능 |
| C9 | https://github.com/0x0funky/agent-sprite-forge | ✅ | 스틸 → 액션 클립 → 스프라이트·맵·엔진 내보내기, pixelfx 연동 | MIT | 5.4k | 외부 API 키 여러 개(없으면 코드 생성 아트로 대체) |
| C10 | https://github.com/mankidev/codixel | ✅ | 픽셀아트 제작 가이드 스킬 | MIT | 143 | 사용자 목록에 두 번 적혀 있었다 → 하나로 처리 |


gpt-image 모델 프롬프트 래핑-보일러 플레이팅 관련:  
https://developers.openai.com/api/docs/guides/image-prompting
이미지에 글자를 넣을 때는 정확한 문구를 따옴표로 표시하고 위치와 글꼴, 등장 횟수까지 지정
기존 이미지를 수정할 때는 변경할 대상뿐 아니라 유지할 요소를 구체적으로 지정
이미지의 주제와 용도 / 결과 - 구도, 스타일, 반드시 지켜야 할 조건을 구분
복잡도(complexity)'와 '화질(quality)'은 서로 다른 설정이다. 복잡도는 이미지 생성에 앞서 구도와 요소 배치를 얼마나 깊이 계획할지를 결정하고, 화질은 질감이나 작은 글씨 등 시각적 세부 묘사에 영향을 준다.





