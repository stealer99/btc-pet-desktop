"""
new_building.py — 산책 모드 마을에 새 건물 준비: 레시피(town.json) 등록 + AI 프롬프트 파일 생성 (빌드 제외 도구)

  python tools/new_building.py cafe "☕ 카페" "a cozy coffee shop with a striped awning" --units 2.5 --sign "COFFEE"
  python tools/new_building.py binance "🟨 바이낸스 타워" "a modern tower in yellow and black tones" --units 4 --sign "{exchange}" --board btc

옵션
  --units   건물 높이 = 캐릭터 키의 배수 (집 2 · 회사 3 · 거래소 타워 4)
  --sign    간판 글자. 고정 글자 또는 {company}(마을 설정의 회사 이름) / {exchange}(시세 거래소 이름)
  --board   옥상 전광판: btc(BTC 가격) / usdt(테더 원화 가격) / neon(마을 설정에서 쓴 문구를 네온 글자로, 그림 전광판을 크게 그려야 함)
  --no-windows  창문 없는 건물 (밤 모드 "창문 못 찾음" 경고 끄기)

만들어지는 것
  art-src/town/town.json 에 시트·건물·순서 추가 (1칸짜리 시트 art-src/town/<key>.png)
  art-src/town/prompts/<key>.md  프롬프트 (첨부·저장 이름·규칙 이유 포함)
다 뽑은 뒤: python tools/build_assets.py --town  → 앱 마을 설정 창 건물 목록에 자동으로 나타남
"""
import argparse
import json
import re
import sys
from pathlib import Path
from string import Template

# 윈도우 콘솔(cp949)에서 이모지·특수기호를 못 찍어 멈추지 않게: 못 찍는 글자만 ? 로 바꾼다 (한글은 그대로)
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(errors="replace")
    except (AttributeError, ValueError):
        pass

ROOT = Path(__file__).resolve().parent.parent
TOWN = ROOT / "art-src" / "town"


# 전광판 그림 지시. 화면은 반드시 "어두운 회색 빈 화면" (town_slice.py 가 이 색으로 자리를 찾음)
#  btc/usdt: 그림 전광판이 작아도 앱이 크게 덮어 그린다 / neon: 그림 크기 그대로 쓰므로 그림에서부터 크게
_SMALL_BOARD = ("BILLBOARD: on the roof, a wide BLANK dark gray billboard screen (about 3:1 width:height) with a thick "
                "frame, supported by short legs.")
BOARD_RULES = {
    "btc": _SMALL_BOARD,
    "usdt": _SMALL_BOARD,
    "neon": ("BILLBOARD: the main feature. On the roof, a HUGE BLANK dark gray billboard screen, about 2.5:1 width:height, "
             "as wide as the whole building and about as tall as one floor of the building. Thick frame in near-black navy, "
             "decorated with a row of small round warm-yellow light bulbs evenly spaced all around the frame (theater "
             "marquee style). Supported by sturdy short legs. The screen itself must be ONE flat, even dark gray area "
             "(no reflections, no grid, no lights, no pictures)."),
}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("key", help="영문 소문자·숫자·_ (예: cafe)")
    ap.add_argument("label", help="마을 설정 창에 보일 이름 (예: ☕ 카페)")
    ap.add_argument("description", help="외형 설명 — 영어 권장")
    ap.add_argument("--units", type=float, default=2.5)
    ap.add_argument("--sign", default=None)
    ap.add_argument("--board", choices=["btc", "usdt", "neon"], default=None)
    ap.add_argument("--no-windows", action="store_true")
    ap.add_argument("--force", action="store_true", help="이미 등록된 건물이면 설정·프롬프트를 덮어쓴다")
    args = ap.parse_args()

    if not re.fullmatch(r"[a-z0-9_]+", args.key):
        sys.exit("key 는 영문 소문자·숫자·_ 만 쓸 수 있어요")
    recipe_path = TOWN / "town.json"
    recipe = json.loads(recipe_path.read_text(encoding="utf-8"))
    if args.key in recipe.get("buildings", {}) and not args.force:
        sys.exit(f"이미 등록된 건물이에요: {args.key} (덮어쓰려면 --force)")

    conf = {"label": args.label, "units": args.units}
    if args.sign:
        conf["sign"] = args.sign
    if args.board:
        conf["board"] = args.board
    if args.board == "neon":
        conf["nightLamps"] = True               # 네온 프롬프트는 전광판 테두리에 전구를 그리게 하므로 밤에도 켠다
    if args.no_windows:
        conf["noWindows"] = True
    recipe.setdefault("buildings", {})[args.key] = conf
    sheets = recipe.setdefault("sheets", [])
    if not any(args.key in s.get("cells", []) for s in sheets):
        sheets.append({"file": f"{args.key}.png", "cols": 1, "rows": 1, "cells": [args.key]})
    order = recipe.setdefault("order", [])
    if args.key not in order:
        order.append(args.key)
    recipe_path.write_text(json.dumps(recipe, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    values = {
        "key": args.key,
        "label": args.label,
        "description": args.description,
        "units": f"{args.units:g}",
        "sign_rule": ("SIGN: above the door, a BLANK light cream sign plate (a wide horizontal rectangle, completely empty)."
                      if args.sign else "SIGN: no sign plate."),
        "board_rule": BOARD_RULES.get(args.board, "BILLBOARD: none."),
    }
    template = (Path(__file__).resolve().parent / "prompts" / "building.md").read_text(encoding="utf-8")
    (TOWN / "prompts").mkdir(parents=True, exist_ok=True)
    out = TOWN / "prompts" / f"{args.key}.md"
    out.write_text(Template(template).safe_substitute(values), encoding="utf-8")

    print(f"등록: art-src/town/town.json → {args.key} {conf}")
    print(f"프롬프트: {out.relative_to(ROOT)}")
    print(f"다음: 그림을 art-src/town/{args.key}.png 로 저장 → python tools/build_assets.py --town")


if __name__ == "__main__":
    main()
