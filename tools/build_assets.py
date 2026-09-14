"""
build_assets.py — 레시피대로 산책 모드 캐릭터·건물 그림을 한 번에 변환 + 품질 검사 (빌드 제외 도구)

  python tools/build_assets.py                  # 전부
  python tools/build_assets.py --only chulgeun  # 캐릭터 하나만
  python tools/build_assets.py --town           # 건물만
  python tools/build_assets.py --characters     # 캐릭터만

레시피
  art-src/characters/<key>/character.json   이름·설명·동작별 원본 파일·격자·fps·속도·땅 기준
  art-src/town/town.json                    시트별 칸 배치, 건물별 이름표·높이·간판·전광판·밤 창문 빌리기, 순서
  (새로 만들 땐 tools/new_character.py, tools/new_building.py 가 틀과 AI 프롬프트를 만들어 준다)

출력 (앱이 읽음)
  img/walk/<key>/<동작>.png·json            캐릭터 스프라이트 시트
  img/walk/characters.js / characters.json  캐릭터 목록 (산책 창 / main 메뉴용)
  img/town/<건물>.png·json(+_night.png)     건물
  img/town/town.js                          건물 목록 + 이름표·간판·전광판 종류 + 기본 순서

품질 검사 (경고만, 변환은 계속)
  캐릭터: 칸마다 크기 차이 / 배경 마젠타 잔여 / 윗줄·아랫줄 실루엣이 같음(다리 교차 안 됨) / 프레임끼리 차이 없음
  건물  : 전광판·간판 자리 못 찾음 / 밤 창문 인식 비율 이상(벽까지 불빛 또는 창문 없음) / 마젠타 잔여
"""
import argparse
import json
import shutil
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from sprite_slice import slice_sheet  # noqa: E402
from town_slice import slice_buildings  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / "art-src"
IMG = ROOT / "img"
REQUIRED_ANIMS = ["walk", "idle", "run", "trudge"]   # 앱(walk-behavior.js)이 쓰는 동작
MOVING_ANIMS = {"walk", "run", "trudge"}
BOARD_TYPES = {"btc", "usdt"}


class Report:
    def __init__(self):
        self.warnings = []
        self.errors = []

    def warn(self, where, text):
        self.warnings.append((where, text))
        print(f"  ⚠️  {text}")

    def error(self, where, text):
        self.errors.append((where, text))
        print(f"  ❌ {text}")


def iou(a, b):
    union = np.logical_or(a, b).sum()
    return float(np.logical_and(a, b).sum() / union) if union else 1.0


def write_js(path, var, data, extra=""):
    path.write_text(
        f"// tools/build_assets.py 가 생성 — 직접 수정하지 말 것\nwindow.{var} = "
        + json.dumps(data, ensure_ascii=False, indent=2) + ";\n" + extra,
        encoding="utf-8",
    )


# ---------------- 캐릭터 ----------------
def check_animation(rep, where, anim, conf, meta, q):
    hw = q["headWidths"]
    spread = (max(hw) - min(hw)) / float(np.median(hw))
    if spread > 0.08:
        rep.warn(where, f"{anim}: 칸마다 캐릭터 크기가 달라요 (머리 폭 차이 {spread:.0%}) — 움직일 때 커졌다 작아졌다 할 수 있어요")
    if q["leftoverRatio"] > 0.003:
        rep.warn(where, f"{anim}: 배경 마젠타가 {q['leftoverRatio']:.1%} 남았어요 — 캐릭터에 분홍·보라색이 있거나 배경이 번졌을 수 있어요")
    masks, cols, rows = q["frameMasks"], q["cols"], q["rows"]
    if anim in MOVING_ANIMS and rows >= 2 and not conf.get("rowsRepeat"):
        # 실측(출근개미): 같은 다리만 앞에 있던 달리기 v1·v2 평균 95~96%, 승인한 걷기 90%·터덜터덜 93%
        # → 평균 94% 이상이면 경고. 경계가 가까워 "확인 권장" 수준이고, 팔이 튀는 문제 등은 실루엣으로 못 잡는다
        pairs = [iou(masks[i], masks[i + cols]) for i in range(cols * (rows - 1))]
        mean = sum(pairs) / len(pairs)
        if mean > 0.94:
            rep.warn(where, f"{anim}: 윗줄과 아랫줄 실루엣이 거의 같아요 (평균 겹침 {mean:.0%}) — "
                            "반대 다리가 안 나오고 같은 다리만 앞에 있을 수 있어요. 미리보기로 확인하세요 "
                            "(윗줄 반복이 의도면 레시피에 rowsRepeat: true)")
    if len(masks) > 1:
        steps = [iou(masks[i], masks[(i + 1) % len(masks)]) for i in range(len(masks))]
        if anim in MOVING_ANIMS and max(1 - s for s in steps) < 0.04:
            rep.warn(where, f"{anim}: 프레임끼리 모양 차이가 거의 없어요 — 움직임이 약해 미끄러지듯 보일 수 있어요")


def build_character(rep, folder):
    recipe_path = folder / "character.json"
    recipe = json.loads(recipe_path.read_text(encoding="utf-8"))
    key = recipe.get("key") or folder.name
    where = f"캐릭터 {key}"
    print(f"\n🐜 {where} ({recipe.get('name', key)})")
    anims = recipe.get("animations", {})
    missing = [a for a in REQUIRED_ANIMS if a not in anims]
    if missing:
        rep.error(where, f"필수 동작이 없어요: {', '.join(missing)} (필수: {', '.join(REQUIRED_ANIMS)})")
        return None
    out = IMG / "walk" / key
    if out.exists():
        shutil.rmtree(out)                    # 지운 동작·옛 파일이 남지 않게 매번 새로
    metas = {}
    for anim, conf in anims.items():
        src = folder / conf["file"]
        if not src.exists():
            rep.error(where, f"{anim}: 원본 파일이 없어요 → {src.relative_to(ROOT)}")
            continue
        try:
            meta, q = slice_sheet(src, conf.get("cols", 4), conf.get("rows", 2), anim, out,
                                  head_width=recipe.get("headWidth", 140), fps=conf.get("fps", 10),
                                  speed=conf.get("speed", 0), ground=conf.get("ground", "cell"),
                                  once=conf.get("once", False), write_manifest=False)
        except ValueError as e:
            rep.error(where, f"{anim}: {e}")
            continue
        print(f"  ✓ {anim:7s} {meta['frames']}프레임 {meta['frameWidth']}×{meta['frameHeight']}  fps {meta['fps']}  속도 {meta['speed']}")
        check_animation(rep, where, anim, conf, meta, q)
        metas[anim] = meta
    if any(a not in metas for a in REQUIRED_ANIMS):
        return None
    return {"key": key, "name": recipe.get("name", key), "description": recipe.get("description", ""),
            "dir": f"img/walk/{key}", "animations": metas}


def build_characters(rep, only=None):
    folders = sorted(p for p in (ART / "characters").glob("*") if (p / "character.json").exists())
    if only:
        folders = [p for p in folders if p.name == only]
        if not folders:
            rep.error("캐릭터", f"art-src/characters/{only}/character.json 이 없어요")
            return
    existing = {}
    manifest_js = IMG / "walk" / "characters.json"
    if only and manifest_js.exists():             # 하나만 다시 만들 땐 나머지 목록은 유지
        for c in json.loads(manifest_js.read_text(encoding="utf-8")):
            existing[c["key"]] = None
    built = {}
    for folder in folders:
        data = build_character(rep, folder)
        if data:
            built[data["key"]] = data
    # 목록 파일: 하나만 빌드했으면 기존 캐릭터의 json 을 다시 읽어 합친다
    for key in existing:
        if key in built:
            continue
        d = IMG / "walk" / key
        anims = {p.stem: json.loads(p.read_text(encoding="utf-8")) for p in d.glob("*.json")}
        recipe = ART / "characters" / key / "character.json"
        r = json.loads(recipe.read_text(encoding="utf-8")) if recipe.exists() else {}
        built[key] = {"key": key, "name": r.get("name", key), "description": r.get("description", ""), "dir": f"img/walk/{key}", "animations": anims}
    (IMG / "walk").mkdir(parents=True, exist_ok=True)
    write_js(IMG / "walk" / "characters.js", "BTCPET_CHARACTERS", built)
    manifest_js.write_text(json.dumps([{"key": k, "name": v["name"]} for k, v in built.items()], ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n  → img/walk/characters.js ({len(built)}명)")


# ---------------- 건물 ----------------
def build_town(rep):
    recipe = json.loads((ART / "town" / "town.json").read_text(encoding="utf-8"))
    buildings = recipe.get("buildings", {})
    print("\n🏘️  건물")
    out = IMG / "town"
    if out.exists():
        shutil.rmtree(out)
    units = {k: float(v["units"]) for k, v in buildings.items()}
    mask_from = {k: v["nightMaskFrom"] for k, v in buildings.items() if v.get("nightMaskFrom")}
    masks = {}
    metas = {}
    # 창문 위치를 빌려 주는 건물이 먼저 처리되도록, 빌리는 건물이 있는 시트를 뒤로
    sheets = sorted(recipe.get("sheets", []), key=lambda s: any(c in mask_from for c in s["cells"] if c))
    for sheet in sheets:
        src = ART / "town" / sheet["file"]
        if not src.exists():
            rep.error("건물", f"원본 파일이 없어요 → {src.relative_to(ROOT)}")
            continue
        names = [c if c else "-" for c in sheet["cells"]]
        unknown = [n for n in names if n != "-" and n not in buildings]
        if unknown:
            rep.error("건물", f"{sheet['file']}: town.json buildings 에 없는 이름 {unknown}")
            continue
        try:
            results = slice_buildings(src, sheet["cols"], sheet["rows"], names, units, out, night=True,
                                      mask_from=mask_from, masks=masks, manifest=False)
        except ValueError as e:
            rep.error("건물", f"{sheet['file']}: {e}")
            continue
        for meta, q in results:
            name = meta["name"]
            conf = buildings[name]
            where = f"건물 {name}"
            print(f"  ✓ {name:8s} {meta['width']}×{meta['height']}  높이 {meta['heightUnits']}배  "
                  f"전광판 {'있음' if meta['screen'] else '-'}  간판 {'있음' if meta['sign'] else '-'}")
            if conf.get("board") and conf["board"] not in BOARD_TYPES:
                rep.error(where, f"board 는 {sorted(BOARD_TYPES)} 중 하나여야 해요 (지금: {conf['board']})")
            if conf.get("board") and not meta["screen"]:
                rep.warn(where, "전광판(board)을 쓰도록 했는데 그림에서 전광판 화면(어두운 회색 가로 사각형)을 못 찾았어요")
            if conf.get("sign") and not meta["sign"]:
                rep.warn(where, "간판(sign)을 쓰도록 했는데 그림에서 간판 자리(크림색 가로 사각형)를 못 찾았어요")
            gr = q["glassRatio"]
            if gr is not None and gr > 0.28:
                rep.warn(where, f"밤 버전: 건물의 {gr:.0%} 가 창문으로 인식됐어요 — 벽까지 불빛이 켜졌을 수 있어요 "
                                "(img/town/*_night.png 확인, 같은 모양 건물이 있으면 nightMaskFrom)")
            if gr is not None and gr < 0.005 and not conf.get("noWindows"):
                rep.warn(where, "밤 버전: 창문(하늘색 유리)을 못 찾았어요 — 밤에 불빛이 없어요 (창문이 없는 건물이면 noWindows: true)")
            if q["leftoverRatio"] > 0.003:
                rep.warn(where, f"배경 마젠타가 {q['leftoverRatio']:.1%} 남았어요 — 분홍·보라색 부분이 지워졌거나 번졌을 수 있어요")
            metas[name] = {**meta, "label": conf.get("label", name), "signText": conf.get("sign"), "board": conf.get("board")}
    order = [n for n in recipe.get("order", []) if n in metas] + [n for n in metas if n not in recipe.get("order", [])]
    out.mkdir(parents=True, exist_ok=True)
    write_js(out / "town.js", "BTCPET_TOWN", metas, f"window.BTCPET_TOWN_ORDER = {json.dumps(order)};\n")
    print(f"\n  → img/town/town.js ({len(metas)}채, 순서 {order})")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only", help="이 캐릭터만 (art-src/characters/<key>)")
    ap.add_argument("--town", action="store_true", help="건물만")
    ap.add_argument("--characters", action="store_true", help="캐릭터만")
    args = ap.parse_args()
    rep = Report()
    do_chars = not args.town or args.characters or args.only
    do_town = (args.town or not (args.characters or args.only))
    if do_chars:
        build_characters(rep, args.only)
    if do_town:
        build_town(rep)
    print("\n" + "=" * 60)
    print(f"완료 — 오류 {len(rep.errors)}개 · 경고 {len(rep.warnings)}개")
    for where, text in rep.errors:
        print(f"  ❌ [{where}] {text}")
    for where, text in rep.warnings:
        print(f"  ⚠️  [{where}] {text}")
    if rep.errors:
        sys.exit(1)


if __name__ == "__main__":
    main()
