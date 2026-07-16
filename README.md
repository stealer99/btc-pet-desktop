# BTC Pet Desktop

바탕화면 위에 항상 떠있는 비트코인 시세 펫 (Windows).
크롬 확장 BTC Badge의 펫을 데스크탑으로 이식한 버전.

## 기능
- 항상 위(always-on-top) 투명 창의 코인 펫 + 가격 말풍선 — 어떤 앱 위에서도 보임
- 트레이 아이콘에 가격 뱃지 (초록/빨강)
- 무드: 횡보(콩콩) / 급등(초록 점프) / 급락(빨강 시무룩) / 4시간봉 마감(코인 플립)
- 트레이 우클릭: 보이기/숨기기, 클릭 통과(펫이 마우스를 막지 않게), 종료
- 펫은 드래그로 이동

## 개발 실행
```
npm install
npm start
```

## 배포 빌드
```
npm run dist        # NSIS 설치본 (직접 배포용)
npm run dist:store  # MSIX/APPX (Microsoft Store 제출용)
```

## Microsoft Store 제출 절차
1. https://partner.microsoft.com 개발자 등록 (개인 일회성 약 $19)
2. 파트너 센터 → 앱 이름 예약 → "제품 ID" 페이지에서 Identity Name / Publisher 값 확인
3. 그 값을 package.json의 build.appx 항목 3곳에 채워넣고 `npm run dist:store`
4. 생성된 .appx 업로드 → 스토어 등록 정보(설명/스크린샷) 작성 → 심사 제출
- 스크린샷/설명은 크롬 스토어용 자료 재활용 가능

## TODO (확장과 기능 맞추기)
- 소스 선택 (Binance/Hyperliquid), 봉 타임프레임 설정, 위치 저장, 김프 표시
