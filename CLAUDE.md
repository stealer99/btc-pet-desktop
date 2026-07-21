# CLAUDE.md — BTC Pet Desktop

Electron 기반 윈도우 데스크탑 위젯. 비트코인 선물 실시간 시세를
"캐릭터 펫" 또는 "탁상시계형 필"로 바탕화면에 항상 표시한다.
크롬 확장(btc-badge, 별도 레포/폴더)과 캐릭터·기능을 공유하는 자매 프로젝트.

## 명령어

```powershell
npm install                                  # 의존성 (electron, electron-updater 등)
npm start                                    # 개발 실행
npx electron-builder --win                   # 로컬 exe 빌드 (관리자 PowerShell 필요)
npx electron-builder --win --publish always  # 릴리스 배포 (GH_TOKEN 환경변수 필요)
```

- 빌드는 **관리자 PowerShell**에서 (winCodeSign 심볼릭 링크 이슈)
- 배포물: `dist/BTC Pet Setup x.x.x.exe` (NSIS). dist/는 gitignore

## 아키텍처

```
main.js                  # 메인 프로세스: 창 3개(오버레이/패널/트레이), 우클릭 메뉴,
                         #   settings.json 저장(userData), IPC broadcast, 자동 업데이트
preload.js               # contextBridge (window.btcpet.*)
overlay.html             # 투명 always-on-top 펫 창 (180폭). styles/ 4종 + renderer/ 로드
panel.html / panel.js    # 좌클릭 팝업 패널: 가격, 캔들차트(15m/1h/4h/1d), 업비트/김프,
                         #   투명도 슬라이더(타이틀바), 도움말
renderer/
  config.js              # 상수 (RECONNECT, MOOD 임계 등)
  overlay-app.js         # 오케스트레이터: 설정 반영, 캐릭터/무드 클래스 조립
  mood-controller.js     # 무드 판정: 최근 60초 모멘텀 ±0.12% -> idle/pump/dump
  price-view.js          # 가격 HUD(하단 무대) 렌더
  drag-controller.js     # 5px 판정 드래그(창 이동) vs 클릭(패널 토글)
  candle-scheduler.js    # 봉 마감 시각 계산 -> 코인플립/필 번쩍
  socket-client.js       # WS 수명주기: generation 카운터 + 지수 백오프 + 지터
  sources/               # 거래소 어댑터 (bitget 기본 / binance / hyperliquid)
styles/
  base.css               # 레이아웃: #wrap 180x216, 가격 HUD(bottom:10, z-index:30),
                         #   .pet-stage(bottom:58 기준선, z-index:10, --pet-user-scale)
  legacy-characters.css  # 구 벡터 캐릭터 (CSS 도형, 현재 메뉴 미노출이지만 유지)
  illustrated-characters.css  # 일러스트 20종 + 캐릭터별 컨셉 모션 (핵심 파일)
  effects.css            # 차트 이펙트: 캔들 3개(loop) / 단일 캔들(once) / 로켓·번개(v3)
img/il/                  # 캐릭터 이미지 256px PNG (키_base/pump/dump.png)
```

### 표시/설정 체계
- 표시 스타일: 펫 / 기본형(탁상시계형 필, 봉 마감 시 pillflash)
- 설정은 main.js가 userData/settings.json에 저장, 변경 시 broadcast("setting-changed", key, value)
- 패널: blur 시 숨김(panelPinned면 유지), close는 hide로 인터셉트(파괴 금지),
  panelFollow면 오버레이 move마다 anchorPanel() — **모니터 판별은 펫 중심점 기준**
  (getDisplayNearestPoint, 멀티모니터 필수)
- 중복 실행 방지: requestSingleInstanceLock (좀비 투명 창 = 타 앱 좌클릭 먹통의 원인)

## 캐릭터 시스템 (일러스트 20종)

컨테이너에 `c-il-{key} m-{mood}` 클래스 조합. 이미지는 base/pump/dump 3장
스왑(표정), 움직임은 전부 CSS 모션. **형태 변화(부풀기/불길/녹기)는 그림이 아니라
모션이 담당** — 이 역할분담이 이 프로젝트의 핵심 규칙.

| key | 이름 | 컨셉 모션 (기본 모션 외 오버라이드) |
|---|---|---|
| wongeum | 원금이(동전) | dump: 깜빡이며 반투명(원금 증발) |
| yudong | 유동이(슬라임) | dump: 녹아내림 |
| algo | 알고(로봇) | pump/dump: steps() 기계 모션·글리치 |
| cheongsan | 청산이(고스트) | dump: 승천 페이드 |
| hojae | 호재(핑크) | pump: 최고 점프 |
| ttun | 뚠뚠이(개미) | idle: 좌우 촐랑(부지런) |
| ikjeol | 익절이(다람쥐) | pump: 점프 중 멈칫(벌써 팔까) |
| sonjeol | 손절이(선인장) | dump: 움찔 |
| shorty | 숏충이(박쥐) | **모션·표정 반전** (pump 통곡 / dump 환희) |
| longy | 롱충이(시바견) | dump: 얼어붙어 미세 떨림 |
| multagi | 물타기(피치핑크 비버) | dump: 2레이어 — 앉은 미니(선명, 정지) + 속마음 대성통곡(제자리 페이드 82%) + 분홍 무드 글로우 |
| kimp | 김프(풍선복어) | pump: il-inflate 부풀기 / dump: il-deflate 피식피식 |
| buljang | 불장(도깨비) | pump: il-blaze 화력(확대+주황 글로우) / dump: 어두워짐 |
| yakson | 약손이(문어) | dump: 좌우 토닥(위로) |
| gazua | 가즈아(공룡) | pump: 포효 대점프 |
| hoengbo | 횡보(개구리) | pump: 절제된 4px 점프(심드렁이 컨셉) |
| ppongsik | 뽕식(개미, base만) | 무표정 고정 + **역베팅 말풍선**: pump "숏 가즈아~" / dump "롱 가즈아~" (.pet::after) |
| jonber | 존버(바위, base만) | idle/pump 완전 정지, dump만 il-endure 3초 주기 미세 진동 |
| maejip | 매집이(민트 세력볼) | pump: 뱉기+금색 입자(il-spit) / dump: il-suck 흡입, **오라 금색 중립** |
| ddeoksang | 떡상이(아기용) | pump: 승천 부유+금색 / dump: 2단 입수(의도적 HUD 잠김) |

- 크기: 메뉴 72/90/110 = `--pet-user-scale`(무대 래퍼 스케일),
  캐릭터별 시각 균질화 = `--ilsize`/`--ilshift-x` (개별 보정). **두 변수 혼용 금지**
- 뽕식·존버는 base 1장만 존재 (무표정이 정체성)

## 자동 업데이트 (0.17.21+)

- electron-updater + GitHub Releases (`stealer99/btc-pet-desktop`, public 필수)
- main.js setupAutoUpdate(): 시작 15초 후 + 4시간 주기 체크, 다운로드 완료 시
  재시작 다이얼로그. dev(모듈 미설치) 환경에선 조용히 스킵
- 배포 = **버전 증가 필수** + `--publish always`. 같은 버전 재배포는 업데이트 미동작

## 컨벤션 (지키지 않으면 사용자가 지적함)

1. **버전은 수정마다 반드시 올린다** (patch 단위). package.json은 JSON 파서로
   수정·검증 — sed 침묵 실패 전력 있음
2. **package.json author는 "stealer"** (Shin으로 되돌리지 말 것)
3. 수정마다 **원인-수정-불변사항을 노트 md**로 남긴다 — **`notes/` 폴더**에 저장
   (기존 `notes/*_NOTES.md` 형식 참조, 특히 `notes/MAINTENANCE_NOTES.md`의 원칙)
4. 무대 기준선(58px)·가격 HUD 위치·z-index 층위는 함부로 바꾸지 않는다 —
   이펙트/캐릭터 겹침 수정은 해당 요소의 키프레임/오프셋 쪽에서 해결
5. 애니메이션에 "하강 성분"을 넣을 때 주의: 무대와 HUD 사이 여유가 7px뿐이라
   키 작은 캐릭터가 HUD 뒤로 파묻힌다 (il-sob 재기준 사례: 진동 중심 0 유지)
6. 요청받은 범위만 수정한다. 기존 캐릭터/기능의 무단 교체 금지

## 캐릭터 추가 절차 (이미지 파이프라인)

1. Gemini(나노바나나)로 생성: base 먼저 -> base 이미지를 첨부하며 "표정만 변경"
   요청 (몸 형태 변형 지시는 캐릭터 붕괴를 유발하므로 금지)
2. 배경: 진짜 투명 > 단색 배경 > 가짜 체커보드 그림 순으로 처리 용이.
   흰 배경은 최악(캐릭터 흰 부위와 충돌). 어두운 무채색 디테일(모자 등)은
   극단 체커 제거 시 소실 위험 — 처리 후 픽셀 검증 필수
3. 256px 트림+하단정렬 PNG -> img/il/{key}_{mood}.png
4. illustrated-characters.css에 이미지 참조 + --ilsize 보정 + 컨셉 모션
5. main.js 캐릭터 메뉴에 라디오 항목 추가

## 알려진 함정

- 투명 창은 보이지 않아도 그 직사각형이 마우스를 삼킨다 (클릭 통과 옵션 존재)
- 패널 창을 close()하면 파괴됨 -> 반드시 hide (main.js에 가드 있음)
- 24h 변동률은 거래소 롤링 24h (업비트식 9시 일봉 기준이 아님 — 의도된 사양)
- Bitget 티커에는 changeUtc24h(9시 기준) 필드도 옴 (기준 전환 시 사용)
- background-position의 세로 기준을 bottom으로 바꾸면 정렬이 깨진다
  (notes/HOENGBO_DUMP_* 참조)
