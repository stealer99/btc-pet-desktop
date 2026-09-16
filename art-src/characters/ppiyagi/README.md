# 삐약이 (`ppiyagi`)

a simple hand-drawn white duckling: a big round head sitting on a pear-shaped white body like a snowman, two tiny black dot eyes far apart, a flat wide pale-yellow beak, two short stubby wing-arms, two big pale-yellow duck feet, two tiny hair strands on top

## 진행 순서
1. `prompts/00_concepts.md` — 시안 4개 → 하나 골라 `ppiyagi_concept_pick.png`
2. `prompts/01_turnaround.md` — 4면도 `ppiyagi_turnaround.png`
3. `prompts/02_walk.md` → `ppiyagi_walk.png`
4. `prompts/03_idle.md` → `ppiyagi_idle.png`
5. `prompts/04_run.md` → `ppiyagi_run.png`
6. `prompts/05_trudge.md` → `ppiyagi_trudge.png`
7. 변환 + 품질 검사: `python tools/build_assets.py --only ppiyagi`
8. 미리보기: `tools/walk-preview.html?char=ppiyagi` (fps·속도가 어색하면 `character.json` 수정 후 7번 다시)
9. 앱: 우클릭 메뉴 > 산책 캐릭터 > 삐약이

## 파일 이름을 바꿔 저장했다면
`character.json` 의 `animations.<동작>.file` 을 실제 파일 이름으로 고치면 된다.
