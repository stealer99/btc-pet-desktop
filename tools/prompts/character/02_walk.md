# 2. 걷기 (평온할 때 산책)

**첨부**: `${key}_turnaround.png` (가능하면 2번 3/4면만 잘라서)
**저장**: `art-src/characters/$key/${key}_walk.png` → 레시피 `walk`

```text
$common

ANIMATION: WALK, a smooth looping walk cycle. Stubby legs take small but
CLEARLY visible steps; arms swing opposite to legs.
1. CONTACT: front leg forward touching the ground, back leg behind. Opposite arm forward.
2. DOWN: body at its LOWEST point, weight on the front leg, slight squash.
3. PASSING: back leg swings forward past the standing leg, body rising.
4. UP: body at its HIGHEST point, the swinging leg lifting forward.
5-8: same as 1-4 but with the OTHER leg forward and the other arm forward.
SECONDARY MOTION: small parts (hair, antennae, ears, tie) bounce slightly,
lagging one frame behind the body. Face expression stays the same.
```

## 확인
- [ ] 다리 2개가 번갈아 앞으로 나오는가 (변환 시 "윗줄·아랫줄 같음" 경고가 나오면 미리보기로 확인)
- [ ] 2·6번이 가장 낮고 4·8번이 가장 높은가
