# 3. 서있기 (멈춤)

**첨부**: `${key}_turnaround.png` + `${key}_walk.png`
**저장**: `art-src/characters/$key/${key}_idle.png` → 레시피 `idle` (rowsRepeat: true)

```text
$common

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
