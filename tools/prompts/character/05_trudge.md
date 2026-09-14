# 5. 터덜터덜 (급락)

**첨부**: `${key}_turnaround.png` + `${key}_walk.png`
**저장**: `art-src/characters/$key/${key}_trudge.png` → 레시피 `trudge`

> 출근개미 교훈: "더듬이를 처지게" 같은 형태 변경 지시는 헤드폰처럼 보이는 등 캐릭터를 망가뜨렸다.
> 슬픔은 **표정 + 몸 기울기 + 느린 걸음**으로만 표현한다.

```text
$common

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
