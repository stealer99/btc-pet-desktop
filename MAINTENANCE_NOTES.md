# BTC Pet 0.17.2 Maintenance Notes

이 버전은 0.17.1의 캐릭터 이미지와 CSS 애니메이션 연출을 유지하면서 제어 로직과 안정성을 보수한 버전입니다.

## 변경 사항

- 동일한 mood 상태에서 불필요하게 클래스를 다시 적용하지 않도록 수정
- pump/dump 진입·해제 임계값을 분리해 경계 구간 표정 깜빡임 완화
- 가격 버퍼를 반복 `filter` 대신 앞쪽 제거 방식으로 관리
- WebSocket 재연결에 지수 백오프와 랜덤 지연 적용
- 거래소 변경 시 이전 소켓과 재연결 타이머가 살아남지 않도록 generation 방식 적용
- ping, reconnect, candle, mood 테스트 타이머 정리 강화
- 잘못된 가격·설정값 방어
- 드래그 중 포커스를 잃었을 때 드래그 상태 초기화
- 설정 파일을 임시 파일에 쓴 뒤 교체하여 저장 중 손상 가능성 완화
- 외부 URL 열기는 HTTP/HTTPS만 허용
- 파괴된 BrowserWindow 접근 방어
- 트레이 아이콘 Data URL 검증
- 버전 0.17.2로 갱신

## 유지한 부분

- 모든 PNG 캐릭터 리소스
- 캐릭터별 base/pump/dump 이미지 선택
- `overlay.html`의 키프레임 수치와 애니메이션 디자인
- 패널 UI 및 기존 설정 호환성

## 확인

다음 파일에 대해 `node --check` 구문 검사를 통과했습니다.

- main.js
- preload.js
- overlay.js
- panel.js

실제 WebSocket 연결과 Windows 패키징은 Windows/Electron 런타임에서 추가 확인이 필요합니다.


## 0.17.3 visual alignment
- Anchored the price bubble to a stable top UI layer, independent of character animation.
- Normalized illustration character sizes using measured opaque PNG bounds.
- Added per-character horizontal visual-center correction.
- Moved Ppongsik dialogue to the side so it no longer overlaps the price bubble.
