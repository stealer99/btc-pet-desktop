# 파라미 — 캐릭터 이식 핸드오프

btc-pet-desktop(Electron)의 신규 캐릭터. 파라파라 추는 방파제 소녀.
컨셉: 횡보(비트 무빙 없음) = "파라파라나 춰야겠다" / 상승 = 갸루피스 / 하락 = 저점 낚시 /
급락 지속 = 반등이 안 잡히니 체념하고 다시 춤.
`preview.html`이 동작 레퍼런스 (단일 파일, 브라우저 실행).

## 파일 구성

```
parami/
├── HANDOFF.md
├── preview.html               # 동작 레퍼런스 (에셋 base64 내장)
└── assets/
    ├── parami_idle_dance.webp # ★ 횡보: 투명 알파 애니메이션 WebP (121프레임, 4.84s 루프, 25fps)
    ├── parami_pump.png        # 상승/급등: 갸루피스 (256px)
    ├── parami_dump.png        # 하락/급락: 앉아서 저점 낚시 (256px)
    ├── parami_despair.png     # 체념: 영혼 없는 춤 (256px)
    ├── parami_idle_a.png      # (폴백) 횡보 정지컷 A — 저사양/축소 모드용, 평시 미사용
    └── parami_idle_b.png      # (폴백) 횡보 정지컷 B
```

## 표루피와 다른 점 (구현 시 핵심)

1. **idle이 애니메이션 WebP** — 정지 PNG가 아님. `<img src="parami_idle_dance.webp">`로 넣으면
   브라우저/Electron이 자동 루프 재생. video 태그·JS 프레임 제어 불필요.
2. **상태 전환이 순차 페이드** — 즉시 스왑 금지. 표루피의 pop과 다름. (아래 전환 시스템 참조)
3. **sleepy 상태 없음** — 이 캐릭터는 5상태(idle/pump/pumpStrong/dump·dumpStrong/despair).
4. **하락 계열에 카메라 줌(1.45x)** — 앉은 포즈의 크기 갭을 줌인 연출로 해소.

## 상태 머신

| 상태 | 에셋 | 트리거 | 비고 |
|---|---|---|---|
| idle | idle_dance.webp | -0.5% ~ +0.5% | 파라파라 루프 |
| pump | pump.png | +0.5% ~ +2% | |
| pumpStrong | pump.png | +2% 이상 | 애니만 강화 + entrance |
| dump | dump.png | -0.5% ~ -2% | 줌 1.45x |
| dumpStrong | dump.png | -2% 이하 | 줌 유지, 3초 후 → despair |
| despair | despair.png | dumpStrong 3초 경과 | 조건 유지 동안 지속. 채도 필터 |

despair에서 반등(+0.5%↑) 시 pump로, 회복(횡보권) 시 idle로 — 모두 순차 페이드 경유.

## 상태 전환 시스템 (순차 페이드)

투명 PNG끼리 동시 크로스페이드하면 실루엣 밖으로 이전 캐릭터가 비쳐 보이므로 반드시 순차로:

```js
// 0.14s 페이드아웃 → src 교체 → 0.14s 페이드인
function transitionTo(src, afterSwap) {
  el.style.transition = 'opacity .14s ease';
  el.style.opacity = '0';
  setTimeout(() => {
    el.src = src;
    if (afterSwap) afterSwap();   // 애니메이션 클래스는 스왑 후 적용
    void el.offsetWidth;
    el.style.opacity = '1';
  }, 150);
}
```

애니메이션 클래스(바운스 등)를 페이드아웃 전에 걸면 어색하므로 afterSwap 콜백에서 적용.

## 애니메이션 (CSS keyframes)

```css
@keyframes bounce     { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-9px) rotate(2deg); } }
@keyframes bounceBig  { 0%,100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-15px) scale(1.05); } }
@keyframes fishBob    { 0%,100% { transform: scale(1.45) translateY(0); } 50% { transform: scale(1.45) translateY(1.5px); } }
@keyframes shakeHard  { 0% { transform: scale(1.45) translateX(-6px); } 50% { transform: scale(1.45) translateX(6px); } 100% { transform: scale(1.45) translateX(-6px); } }
@keyframes tiredDance { 0%,100% { transform: translateY(1px) rotate(-.6deg); } 50% { transform: translateY(3px) rotate(.6deg); } }
@keyframes entrance   { 0% { transform: translateY(120px); opacity:0; } 100% { transform: translateY(0); opacity:1; } }
```

| 상태 | 애니 | duration | 부가 |
|---|---|---|---|
| idle | (없음 — WebP 자체 재생) | | transform-origin: 50% 100% 공통 |
| pump | bounce | 0.55s | `drop-shadow(0 0 9px rgba(249,168,212,.65))` 핑크 글로우 |
| pumpStrong | entrance 1회 → bounceBig | 0.5s → 0.34s | 글로우 강화 `0 0 12px .95` |
| dump | fishBob | 2.2s | scale 1.45 내장 (줌) |
| dumpStrong | shakeHard | 0.15s | scale 유지 + `drop-shadow(0 0 10px rgba(248,113,113,.8))` |
| despair | tiredDance | 1.4s | `filter: saturate(.55) brightness(.92)` — 영혼 없음 표현 |

`prefers-reduced-motion: reduce` 시 CSS 애니 전부 제거. WebP는 그대로 재생 (필요시 폴백 정지컷 idle_a로 대체 가능).

## 스케일 규칙 (컷 추가 시 필수)

전 상태의 캐릭터 크기는 **핑크 모자 폭 = 46px (256px 캔버스 기준)** 으로 통일돼 있다.
캔버스 채우기 기준으로 리사이즈하면 앉은 포즈 등에서 머리가 거대해지므로 금지.
새 컷 추가 시: 모자 폭 실측 → 46px 되도록 스케일 → 발 중심 x=128, 하단 y=248 정렬.

## 제작 이력 / 튜닝 노트

- idle 원본: 파라파라 밈 영상(모션) + 캐릭터 이미지 → Viggle 모션 트랜스퍼 → 그린스크린
  크로마키 → 163프레임 중 f14~f134 루프 절단(시작·끝 포즈 유사도 최소 지점).
- 정지컷 3장은 idle 영상 캐릭터(f26)를 앵커로 투샷(캐릭터 ref + 포즈 ref) 재생성 —
  구버전 쨍한 치비 컷과 섞지 말 것 (전환 시 캐릭터 정체성 붕괴로 기각된 이력).
- 일부 프레임에서 손끝이 화면 경계에 닿는 것은 소스 영상 자체 한계 (2~3프레임, 재생 중 인지 불가).
- dump 줌 1.45는 사용자 확정값. 크기 갭 문제로 도입. 대안(서서 낚시 포즈 재생성)은 보류 상태.
- 이름 "파라미"(파라파라+미나미). 컨셉 유래: 파라파라 밈 + 거제 야호 + 방파제 낚시.
