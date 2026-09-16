# 2. 걷기 (평온할 때 산책)

**첨부**: `ppiyagi_turnaround.png` (가능하면 2번 3/4면만 잘라서)
**저장**: `art-src/characters/ppiyagi/ppiyagi_walk.png` → 레시피 `walk`

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

ANIMATION: WALK, a smooth looping walk cycle.

LEGS — THE MOST IMPORTANT RULE: in every frame the two legs must be in a
DIFFERENT position, and the gap between the two feet must be clearly visible.
One foot is planted FORWARD on the ground while the other is BEHIND or lifted.
Frames where both feet sit side by side under the body look like sliding, not
walking. Never draw the same leg pose twice in a row.

1. CONTACT: front foot planted clearly FORWARD, back foot clearly BEHIND on the
   ground, legs at their widest. Opposite arm forward.
2. DOWN: body at its LOWEST point, weight on the front foot, the back foot
   lifting its heel, slight squash.
3. PASSING: the back foot swings forward and passes the standing leg (feet
   briefly close together), body rising.
4. UP: body at its HIGHEST point, the swinging foot reaching forward, heel
   about to touch.
5-8: the SAME four poses with the legs SWAPPED (the other foot forward) and the
   other arm forward. Cells 5-8 must be mirrored leg poses, not copies of 1-4.
SECONDARY MOTION: small parts (hair, antennae, ears, tie) bounce slightly,
lagging one frame behind the body. Face expression stays the same.
```

## 뒤뚱뒤뚱 걷기 (오리·펭귄처럼 다리가 짧은 캐릭터)
위 ANIMATION 블록을 아래로 바꾼다. 8칸 대신 **한 줄 4칸**으로 받는 게 안전하다
(칸이 적을수록 AI 가 자세를 섞지 않는다 — 레시피 `cols: 4, rows: 1`).

```text
ANIMATION: a WADDLE walk. The body rocks side to side while the feet still STEP.
1. Body tilts ~10 degrees toward the RIGHT, the RIGHT foot planted flat and
   clearly FORWARD, the LEFT foot lifted and clearly BEHIND (big gap, toe down).
2. Body upright and at its HIGHEST point, both feet together under the body.
3. The MIRROR of frame 1: body tilts ~10 degrees LEFT, LEFT foot planted
   forward, RIGHT foot lifted behind.
4. Same as frame 2.
The little arms flap up on 1 and 3, down on 2 and 4.
```

## 확인
- [ ] **두 발이 앞뒤로 벌어진 프레임이 있는가** (네 발이 다 나란하면 미끄러져 보인다 → 다시 뽑기)
- [ ] 다리 2개가 번갈아 앞으로 나오는가 (변환 시 "윗줄·아랫줄 같음" 경고가 나오면 미리보기로 확인)
- [ ] 2·6번이 가장 낮고 4·8번이 가장 높은가 (뒤뚱 4칸이면 1·3 이 낮고 2·4 가 높다)
