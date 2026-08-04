# 파라미(parami) 22번째 캐릭터 — 이식 (v0.17.39)

parami_HANDOFF.md 이식. 표루피처럼 **전용 컨트롤러로 격리**하되(다른 캐릭터 무영향),
렌더링 방식이 근본적으로 다르다.

## 표루피와 다른 핵심 (사용자 강조 4가지)

1. **idle = 애니메이션 WebP** — 정지 PNG 아님. 전용 `<img>`의 src가 `parami_idle_dance.webp`일 때
   브라우저/Electron이 자동 루프 재생(JS 프레임 제어 불필요). 그래서 다른 캐릭터의 `.body`
   background-image 스왑 방식을 안 쓰고, **전용 `<img class="parami-img">`를 .pet에 주입**하고
   `.c-il-parami .body`는 CSS로 숨긴다.
2. **상태 전환 = 순차 페이드** — 즉시 스왑 금지(투명 PNG 크로스페이드 시 실루엣 밖으로 이전
   캐릭터가 비침). `_render`: `opacity 0.14s` 아웃 → (150ms 후) `img.src` 교체 + 클래스/애니 적용
   → `opacity 1` 인. **애니메이션 클래스는 스왑 후 적용**(HANDOFF 콜백 위치).
3. **sleepy 없음** — 5상태(idle/pump/pumpStrong/dump/dumpStrong/despair). 상태머신은 표루피
   최종본과 동일(앱 감도 enter + exit 히스테리시스 + strong 3.5배 + 브릿지 + dumpStrong 3초→despair)
   에서 sleepy 로직만 제거.
4. **하락 계열 scale(1.45) 줌 내장** — `prm-fishBob`/`prm-shakeHard` keyframe에 scale(1.45).
   앉은 낚시 포즈의 크기 갭 해소용, **사용자 확정값 — 제거 금지**.

## 파일별

- **renderer/parami-controller.js** (신규): 상태머신 + `<img>` 주입 + 순차 페이드(`_render`)
  + entrance 1회(비상승계→pumpStrong 진입 시만) + dev 테스트 훅.
- **illustrated-characters.css**: `.c-il-parami` `.body{display:none}`, `.parami-img`(contain,
  bottom, transform-origin 50% 100%), 상태별 `prm-*` 애니 + keyframe(prm-bounce/bounceBig/
  fishBob/shakeHard/tiredDance/entrance) + reduced-motion. `--ilsize: 96px`(추정).
- **overlay-app.js**: parami 인스턴스 + 가격 라우팅 + applyCharacter(pyo/parami 상호 배타 engage)
  + fxStyle refresh + 감도 resetPrices + dev 테스트 라우팅(pyo||parami).
- **overlay.html**: parami-controller.js include. **main.js**: 캐릭터 메뉴 "파라미".
- CLAUDE.md 표/카운트(21→22), CSS 카운트 주석.

## 불변사항 / 주의

- **전용 <img> + 순차 페이드**가 정체성. 즉시 스왑(background-image 방식)으로 되돌리지 말 것.
- 하락 keyframe scale(1.45) 제거 금지.
- 감도 임계는 앱 설정(cfg.moodPumpPct 등)을 따름 — HANDOFF의 0.5%/2% 고정값은 표루피 교훈대로
  60~65초 모멘텀엔 둔감해서 폐기(다른 펫과 동일 반응).
- disengage 시 `<img>` 제거 → 공유 DOM(.pet) 오염 없음. `.body{display:none}`은 `.c-il-parami`
  스코프라 다른 캐릭터 무영향.
- **미검증**: idle WebP 재생·페이드 전환·줌·상태 전환은 화면 육안 확인 필요. preview.html 대조 권장.
  `--ilsize: 96px`, 페이드 타이밍은 튜닝값.
