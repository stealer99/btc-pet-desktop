# 패널 업비트/테더/김프 자동 갱신 (v0.17.38)

## 증상

패널의 업비트 BTC 가격·테더(KRW-USDT) 가격·김치 프리미엄·환율이 **앱 켠 시점 값에 굳어**
실제 시세와 어긋남. 자매 프로젝트인 크롬 확장(btc-badge)은 계속 갱신되는데 데스크탑만 멈춰 있었음.

## 원인

panel.js의 해당 로직이 **IIFE로 앱 시작 시 1회만 fetch**하고 setInterval이 없었음.
패널 창은 close가 아니라 hide라(파괴 안 됨) 다시 열어도 재실행되지 않아 값이 영구히 고정.
(상단 메인 BTC 가격은 WS로 실시간 갱신돼서, 이 부분만 옛날 값이라 더 이상하게 보임.)

## 수정 (panel.js)

- IIFE `(async()=>{...})()` → **`async function loadKimp()`** 로 추출.
- `loadKimp()` 최초 1회 + **`setInterval(loadKimp, 30000)`**(30초 주기) + `visibilitychange`에서
  패널이 다시 보일 때 즉시 최신화.
- Electron 기본 backgroundThrottling으로 숨김 상태에선 타이머가 알아서 throttle → 낭비 없음.
  보이면 visibilitychange가 즉시 fetch하므로 열 때 항상 최신.

## 불변사항

- 표시값은 업비트 API `trade_price` 원본 그대로(가공 없음), 라벨-값 매핑 정상(업비트KRW=BTC, USDT=테더).
- 김프/테더김프 계산식은 기존 그대로(정상). 이번 건 **갱신 누락**만 수정.
- 갱신 주기 30초는 조정값(환율 소스 rate-limit 여유 고려).

## 릴리스 노트 원칙 (이번에 정리)

- release-notes.md는 **이번 배포 버전의 변경분만** 담는다. 배포가 나가면 비우고 다음 버전 것으로 교체.
  이전(이미 배포된) 버전 문구를 누적하지 않는다.
