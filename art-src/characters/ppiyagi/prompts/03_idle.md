# 3. 서있기 (멈춤)

**첨부**: `ppiyagi_turnaround.png` + `ppiyagi_walk.png`
**저장**: `art-src/characters/ppiyagi/ppiyagi_idle.png` → 레시피 `idle` (rowsRepeat: true)

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

ANIMATION: IDLE, a calm looping standing animation.
Standing still, both feet planted on the ground line in ALL frames.
1-4: gentle breathing IN, the body rises very slightly.
5-8: breathing OUT, the body settles back.
Frame 6 only: eyes closed (a blink). All other frames: eyes open.
Arms relaxed at the sides. Expression: calm, the same as the reference.
```

## 확인
- [ ] 발이 8칸 모두 제자리인가
- [ ] 6번에만 눈을 감았는가
