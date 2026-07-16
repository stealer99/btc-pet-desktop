# 0.17.16 횡보 개구리 Dump 정렬 보정

- `hoengbo_base.png`와 `hoengbo_pump.png`의 실제 불투명 중심은 x=150.5px입니다.
- `hoengbo_dump.png`의 실제 불투명 중심은 x=127px입니다.
- 동일한 공통 오프셋을 사용하면 Dump 상태만 화면에서 왼쪽으로 치우쳐 보였습니다.
- Dump 상태에만 `--ilshift-x: 2px`를 적용해 약 7px 우측 보정했습니다.
- 이미지, 키프레임, 애니메이션 속도, 다른 캐릭터 위치는 변경하지 않았습니다.
