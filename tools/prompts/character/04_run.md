# 4. 달리기 (급등 · 거래소 질주)

**첨부**: `${key}_turnaround.png` + `${key}_walk.png`
**저장**: `art-src/characters/$key/${key}_run.png` → 레시피 `run` (ground: row, rowsRepeat: true)

> 출근개미 교훈: 팔을 흔들게 하면 AI가 프레임마다 팔을 튀게 그리고, 다리 교차를 "어두운 다리"로 구분시키면
> 음영만 깜빡인다. **팔은 뒤로 뻗어 고정 + 다리는 실루엣이 확 다른 두 자세(보폭 ↔ 무릎 올리기)** 가 통했다.

```text
$common

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
