# 0.17.19 흐느낌 재기준 + 매집이 + 실행 락

## il-sob 재기준 (횡보 dump 묻힘 수정)
- 원인: 무대 기준선(58px)과 가격 HUD 상단(~51px) 사이 여유 7px에서
  il-sob이 translateY(3px) 하강 + scaleY(0.93) 스퀴시로 캐릭터 하단이
  HUD 뒤(z-index 30 > 10)로 파묻힘. 키 작은 캐릭터(76px)에서 두드러짐
- 수정: il-sob 진동 중심을 0으로 재기준 (0.5px ~ -1.5px, 진폭 2px 유지)
  하강 성분 제거로 횡보/가즈아/익절이 전부 해소. 스퀴시 0.93 -> 0.95
- 무대 기준선/HUD 위치/z-index는 변경하지 않음

## 매집이 (세력볼) 추가 - 19번째
- img/il/maejip_{base,pump,dump}.png
- pump: 물량 뱉기 (il-hop 0.8s + 입자 il-spit1/2, 초록 오라)
- dump: 전량 흡입 (il-suck, 금색 중립 오라 - 하락이 호재인 캐릭터)
- 캐릭터 메뉴 존버 앞에 추가

## 중복 실행 방지
- app.requestSingleInstanceLock: 두 번째 인스턴스 즉시 종료,
  재실행 시도 시 기존 오버레이 show+moveTop
- 좀비 투명 창(다른 앱 좌클릭 먹통)의 구조적 재발 방지

## 로켓 발사 시작점 수정
- 원인: launch 0%의 translateY(26px)가 로켓을 HUD 상단(~51px)에 어중간하게
  걸친 위치(하단 28px)에서 페이드인시켜 몸통이 잘린 채 등장
- 수정: 시작 오프셋 46px(HUD 뒤 완전 은폐) + 시작부터 opacity 1
  -> 무대 뒤에서 솟아오르는 발사 연출로 전환. z-index/기준선 변경 없음

## 0.17.20 이펙트 타이밍 보정
- 단일 캔들: 구간별 감속 곡선(55%/80% 정지점)으로 끊기던 것을
  성장+상승 연속 흐름(ease-in-out, 정지 프레임 제거)으로 병합. up/down 동일
- 로켓: 가속 곡선 탓에 은폐 구간이 길어 변화가 안 보이던 것을
  0~22% 구간에 빠르게 무대 위로 솟아오르도록 중간 키프레임 추가
- 매집이 v3: 단색 민트 배경본으로 교체 (모자 소실 이슈 해결)

## 0.17.21 자동 업데이트 (electron-updater + GitHub Releases)
- publish: github stealer99/btc-pet-desktop
- 시작 15초 후 + 4시간 주기 체크, 백그라운드 다운로드,
  완료 시 재시작 안내 다이얼로그 (나중에 선택 시 종료 때 자동 적용)
- 릴리스 절차: 버전 올림 -> $env:GH_TOKEN 설정 -> npm run dist -- --publish always
- 주의: 레포(최소 Releases)가 public이어야 사용자 업데이트 수신 가능
