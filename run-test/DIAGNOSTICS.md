# 별도 진단도구

`diagnose.py`는 게임 실행 진입점 `main.py`와 분리돼 있다. `unittest`와 표준 라이브러리만으로 규칙·상태·레이어 데이터를 확인한다. pico2d/SDL은 `--visual`에서만 사용한다. 이 문서는 사용자 실행 절차이며 지금까지 실행한 결과가 아니다.

## 네 가지 분류

| 분류 | 진단 범위 | 파일 |
|---|---|---|
| 레이어 | board, pieces, bosses, specials, path, ui, fx의 데이터 분리·표시 마스크·스냅샷 독립성 | tests/test_layers.py, view_model.py |
| 기능 | 3칸 시야·추적 고정·재탐색·보스 선공·칸 효과·예측 난수·수치 편집·구매·확률·상점 관리 | tests/test_features.py |
| 단계 | DRAW → REVEAL → SELECT → MOVE → 적 턴/마스터 → 보상 → 상점/추가 이자 → 다음 라운드 | tests/test_steps.py |
| 라운드 | 9개 라운드, 일반/확장판, 특수칸 개수, 보스 성장, 빅 갱신 충격과 대기 말 제외 | tests/test_rounds.py |

레이어 단위 테스트는 렌더러에 전달하는 데이터를 검증한다. 실제 픽셀·한글 출력·SDL·화면 겹침 검증은 시각 진단에서 사용자가 확인한다. 레이어를 꺼도 진단용 버튼/설명은 남는다. `ui`는 게임 점수판·손패, `fx`는 점수 이미지 효과이며 서로 별도로 켜고 끌 수 있다.

## 사용자 실행 명령

`run-test` 폴더에서 실행한다.

```powershell
# 먼저 케이스 이름 조회 (테스트 미실행)
py -3.13 diagnose.py --list
py -3.13 diagnose.py --group features --list

# 분류별 실행
py -3.13 diagnose.py --group layers
py -3.13 diagnose.py --group features
py -3.13 diagnose.py --group steps
py -3.13 diagnose.py --group rounds

# 한 기능/단계만 선택
py -3.13 diagnose.py --group features --case boss_detects
py -3.13 diagnose.py --group features --case preview
py -3.13 diagnose.py --group steps --case draw_reveal
py -3.13 diagnose.py --group steps --case reward_choice

# 특정 레이어/특정 라운드만 선택
py -3.13 diagnose.py --layer bosses
py -3.13 diagnose.py --round 1-3
py -3.13 diagnose.py --round 3-3

# 전체 실행과 별도 결과 파일
py -3.13 diagnose.py --group all --report reports/all.json

# SDL을 사용하는 화면 진단
py -3.13 diagnose.py --visual --scene boss:detect
py -3.13 diagnose.py --visual --round 2-3
py -3.13 diagnose.py --visual --layer specials --scene tile:tax
```

`--round`는 해당 라운드의 그래프·특수칸·보스 초기 상태와 한 턴 진행을 확인한다. `--group rounds`는 9개 전체와 성장/충격 비교를 실행한다. `--layer`는 하나의 표시 마스크를, `--group layers`는 전체 레이어의 격리를 확인한다. `--case`는 이름 부분 문자열 필터다. 존재하지 않는 선택은 성공 처리하지 않고 오류로 종료한다. `--list`와 `--visual`에서는 단위 테스트 보고서를 생성하지 않는다.

기본 결과는 `reports/diagnostics.json`이다. 데이터 버전·선택 분류·케이스/하위 케이스별 pass/fail/error/skip·실행 시간·실패 설명을 기록한다. 테스트 실패는 종료 코드 1, 성공은 0이다. 실행하지 않은 결과 파일이나 통과 표시를 미리 만들지 않았다.

## 화면에서 단계만 실행

`--visual`의 왼쪽 **단계 진단: 적 턴만 실행**은 플레이어 행동 없이 탐지/윷/이동/전투를 실행한다. **마스터 1틱**은 진단 턴을 1 올리고 전역 효과·갱신·빅 충격을 적용한다. 실제 상태를 변경하므로 같은 장면을 다시 선택해 초기화한다. 이 기능은 정규 런 순서를 대체하는 진단용이다.

시야는 편집 ON → 대상을 일반 보스로 변경 → 시야 +/-로 바꾼다. 플레이어와 보스를 보드에 배치한 후 편집 OFF → 적 턴만 실행으로 경계 2/3/4칸, 대상 고정과 대상 사망 후 재탐색을 확인한다. 단독 단계 실행은 완료 후 단계/재화를 자동 정산하지 않는다.

## 재현 자료

실패 시 명령, 시드, 장면 ID, JSON 보고서와 F5 `saved-scene.json`을 함께 남긴다. F5 파일은 상태 진단 증거이며 자동 불러오기 형식은 아니다. 이 시험본의 상태 키는 Python용이며 HTML JSON과 호환하지 않는다.

개발 과정에서 게임·테스트·문법 검사·검증기를 실행하지 않았다. 따라서 통과 수·실제 화면·프레임 유지·HTML과의 완전한 동작 일치는 미확인이다.
