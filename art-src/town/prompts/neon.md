# 건물: 🌃 네온 상가 (`neon`)

**첨부**: `art-src/town/buildings.png` + `art-src/town/exchange_towers.png` (그림체·크기감 참고)
**저장**: `art-src/town/neon.png`

> 규칙 이유
> - 글자·로고·숫자 금지: AI 글자는 깨지고 실제 로고는 상표 문제. 간판·전광판 글자는 앱이 그린다
> - 창문은 **하늘색 유리**: 밤 모드 불빛을 자동으로 만드는 기준 색 (벽을 하늘색으로 칠하면 벽까지 불이 켜짐)
> - 간판은 **크림색 빈 판**, 전광판은 **어두운 회색 빈 화면**: 앱이 이 색으로 글자 자리를 찾는다

```text
Create ONE small building for a desktop-pet village, in the SAME art style as the
attached building sheets (cute chibi style, thick dark outline, soft flat cel shading,
subtle paper texture, sticker-like toy look). Do NOT copy their exact buildings.

BUILDING: a compact two-story night-street shop building, only TWO shop fronts with striped orange-and-cream awnings on the ground floor, a second floor with two windows, dark navy walls with warm orange trims, a simple roof railing, topped by a huge rooftop billboard

VIEW: flat front elevation (straight-on, no perspective, no rooftop seen from above).
Chunky, toy-like, slightly squashed proportions. Simple bold shapes with FEW, LARGE
details (it will be shown small on screen). About 3 times as tall as the small
mascot in the attached sheets; the front door is about 1.2 times the mascot's height.

WINDOWS: light sky-blue glass with a few white diagonal highlight stripes.
WALLS: must NOT be light sky-blue or cyan (keep walls clearly different from the glass).
SIGN: no sign plate.
BILLBOARD: the main feature. On the roof, a HUGE BLANK dark gray billboard screen, about 2.5:1 width:height, as wide as the whole building and about as tall as one floor of the building. Thick frame in near-black navy, decorated with a row of small round warm-yellow light bulbs evenly spaced all around the frame (theater marquee style). Supported by sturdy short legs. The screen itself must be ONE flat, even dark gray area (no reflections, no grid, no lights, no pictures).

LAYOUT: a single image with ONLY this one building, centered, standing on a flat
ground line near the bottom, filling most of the image height. Clear empty space
around it.

RULES:
- NO text, NO letters, NO logos, NO numbers, NO symbols anywhere.
- Door closed. No people, no characters, no trees, no cars, no ground, no sky.
- Colors must NOT include magenta, hot pink or purple.

BACKGROUND: solid flat magenta (#FF00FF), no gradient, no shadow, no checkerboard.
```

## 뽑은 뒤
```powershell
python tools/build_assets.py --town
```
경고가 나오면 그 내용대로 다시 뽑거나 레시피(`art-src/town/town.json`)를 조정하세요.
