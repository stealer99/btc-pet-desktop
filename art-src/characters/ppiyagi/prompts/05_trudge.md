# 5. 터덜터덜 (급락)

**첨부**: `ppiyagi_turnaround.png` + `ppiyagi_walk.png`
**저장**: `art-src/characters/ppiyagi/ppiyagi_trudge.png` → 레시피 `trudge`

> 출근개미 교훈: "더듬이를 처지게" 같은 형태 변경 지시는 헤드폰처럼 보이는 등 캐릭터를 망가뜨렸다.
> 슬픔은 **표정 + 몸 기울기 + 느린 걸음**으로만 표현한다.

```text
Create a sprite sheet of the attached mascot "삐약이".
Keep the design EXACTLY the same as the 3/4 view facing RIGHT in the attached
turnaround: same chibi proportions, same head size, same face, same colors,
same outfit, same short limbs.
Same art style: dark charcoal outline (#3a3a3a) of medium thickness, drawn with
slightly wobbly hand-drawn strokes. NO shading, NO gradients, flat plain white
fill. Keep the silly, dopey look: blank stare, nothing perfectly symmetrical.

FIXED PARTS (identical in EVERY frame — never reshape, merge, bend, add or remove them):
- a big round head sitting on the body like a snowman, with the head outline visible where it overlaps the body
- exactly two tiny black dot eyes, far apart and slightly uneven in height
- exactly ONE flat wide pale-yellow beak
- two big pale-yellow duck feet
- two tiny hair strands on top of the head
- no ears, no tail, no clothes
Only the body pose, arms, legs and facial expression may change.

VIEW: 3/4 view facing RIGHT in every frame. In place (no travel).

LAYOUT: a single landscape image with a grid of 8 equal cells,
4 columns x 2 rows, read left-to-right, top row first.
- The character is the SAME SIZE in every cell and horizontally centered.
- One shared GROUND LINE at the same height in every cell.
- Leave clear empty space between characters. No grid lines, no borders.
- The BOTTOM ROW must NOT repeat the top row. Every one of the 8 cells is a
  different pose; cells 5-8 continue the motion from cells 1-4.

BACKGROUND: solid flat magenta (#FF00FF), no gradient, no shadow,
no floor, no text, no labels, no frame numbers, no checkerboard.

ANIMATION: TRUDGE, a slow, sad, dragging looping walk.
Shoulders slumped, whole body tilted slightly forward, arms hanging loose.
Expression: gloomy, half-closed teary eyes, small frown.
LEGS: each frame must show a CLEARLY DIFFERENT leg position.
1. CONTACT: front foot shuffles forward, low.
2. DOWN: body sags to its lowest point, both feet on the ground.
3. PASSING: back foot drags forward past the standing leg, toes scraping.
4. UP: body rises only slightly (much less than a normal walk).
5-8: same as 1-4 with the other leg.
```

## 확인
- [ ] 칸마다 다리 모양이 확실히 다른가 (같으면 미끄러지듯 보임)
- [ ] 슬픈 표정이 작게 봐도 읽히는가
