# 4. 달리기 (급등 · 거래소 질주)

**첨부**: `ppiyagi_turnaround.png` + `ppiyagi_walk.png`
**저장**: `art-src/characters/ppiyagi/ppiyagi_run.png` → 레시피 `run` (ground: row, rowsRepeat: true)

> 출근개미 교훈: 팔을 흔들게 하면 AI가 프레임마다 팔을 튀게 그리고, 다리 교차를 "어두운 다리"로 구분시키면
> 음영만 깜빡인다. **팔은 뒤로 뻗어 고정 + 다리는 실루엣이 확 다른 두 자세(보폭 ↔ 무릎 올리기)** 가 통했다.

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

ANIMATION: RUN, a comedic "arms-back dash" looping run cycle.
BODY: leaning FORWARD strongly, head leading the way.
ARMS: BOTH arms stretched straight BACKWARD behind the body, angled slightly
downward. The arms keep this SAME pose in ALL frames (no arm swinging).
Expression: super excited and determined, sparkling eyes, big open smile.

LEGS — the SILHOUETTE of the legs must change a lot between frames.
There are only TWO leg poses, and they alternate:
STRIDE POSE: legs SPLIT WIDE apart. One leg reaches far FORWARD, the other
stretches far BACKWARD. Both feet low, near the ground line. Body at its LOWEST.
KNEE-UP POSE: legs CLOSE TOGETHER under the body. One leg stands straight down,
its foot on the ground line. The other leg's KNEE is raised HIGH in FRONT of
the belly, with its foot tucked up under the knee. Body at its HIGHEST.

TOP ROW (one full running cycle):
1. STRIDE POSE — NEAR leg forward, FAR leg back.
2. KNEE-UP POSE — standing on the NEAR leg, FAR knee raised high in front.
3. STRIDE POSE — FAR leg forward, NEAR leg back.
4. KNEE-UP POSE — standing on the FAR leg, NEAR knee raised high in front.
BOTTOM ROW (frames 5-8): exactly the same as frames 1-4.
```

## 확인
- [ ] 2·4번에 무릎이 배 앞으로 확실히 올라왔는가
- [ ] 팔이 8칸 모두 같은 자세인가
- [ ] 머리·소품 모양이 참고와 같은가 (합쳐지거나 두 개가 되지 않았는가)
