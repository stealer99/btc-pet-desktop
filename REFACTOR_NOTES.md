# 0.17.8 구조 분리 보수

## 원칙
- 기존 PNG 자산 변경 없음
- 기존 CSS 선언 및 keyframes 수치 변경 없음
- 가격 상태 판정 임계값과 WebSocket 동작 유지

## 분리 구조
- `styles/base.css`: 공통 레이아웃과 기본 펫
- `styles/legacy-characters.css`: 초기 CSS 캐릭터 변형
- `styles/effects.css`: 캔들 3개, 단일 캔들, 로켓/번개
- `styles/illustrated-characters.css`: 일러스트 18종 이미지, 크기 보정, 애니메이션
- `renderer/sources/*`: 거래소별 WebSocket 어댑터
- `renderer/mood-controller.js`: idle/pump/dump/candle 상태
- `renderer/price-view.js`: 가격 HUD와 트레이 렌더링
- `renderer/socket-client.js`: 연결, 핑, 재연결
- `renderer/candle-scheduler.js`: 캔들 마감 알림
- `renderer/drag-controller.js`: 드래그 및 컨텍스트 메뉴
- `renderer/overlay-app.js`: 설정 연결과 초기화

`overlay.html`은 마크업과 로딩 순서만 담당합니다.
