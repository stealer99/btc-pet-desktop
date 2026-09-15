"""
town_slice.py — AI 격자 건물 시트(단색 마젠타 배경) → 건물별 투명 PNG + 메타(전광판·간판 위치)

  python tools/town_slice.py art-src/town/buildings.png --cols 2 --rows 2 ^
      --names home,office,-,- --units home=2,office=3 --out img/town
  (보통은 레시피로 한 번에: python tools/build_assets.py — 이 파일의 slice_buildings() 를 쓴다)

캐릭터(sprite_slice.py)와 다른 점:
  - 정렬 기준이 머리가 아니라 **바닥 중앙** (건물은 움직이지 않으므로 칸마다 한 장씩 트림해서 저장)
  - 리샘플하지 않고 원본 해상도로 저장, 화면 크기는 `heightUnits`(캐릭터 키의 배수)로 코드에서 결정
    → 원본 해상도가 건물마다 달라도 표시 크기는 단위로 통일
  - 코드가 글자를 얹을 자리를 자동 검출해 메타에 기록
      screen: 전광판 화면 — 무채색 어두운 회색(실측 57,55,54), 가로로 긴 직사각형
      sign  : 간판 — 크림색(실측 253,246,228), 가로로 긴 직사각형
    검출 조건: 색 마스크의 가장 큰 덩어리가 bbox 를 85% 이상 채우고 가로:세로 2 이상일 때만 채택
    (집 벽 같은 넓은 크림색 면이 간판으로 오인되지 않게)

출력 (--out 폴더): {name}.png, {name}.json, town.js (폴더 내 모든 json 매니페스트)

밤 버전 (--night):
  {name}_night.png 를 함께 만든다. 유리창(파랑이 거의 최대인 하늘색: B≥236, G≥190, 60≤R≤165)은 따뜻한 노란 불빛,
  나머지는 어둡고 푸르게. 벽이 유리와 같은 색인 건물은 --night-mask-from 으로 같은 크기 건물의 창문 위치를 빌린다
  (예: 같은 시트에서 같은 모양으로 생성된 두 거래소 타워 → bitget=upbit)
  전구(레시피 nightLamps, slice_buildings(lamps=...)): 노란 전구(R≥200, G≥200, B≤120, G-B≥100)는 밤에도 켜 두고
  둘레 3px 에 따뜻한 번짐. 주황 장식(G≈140)·크림색(B≈220)은 제외. 켠 건물만 적용 (집 문고리 같은 노란 점까지 켜지지 않게)
  메타 lamps = 전구마다 [x, y, 반지름] → 앱이 전구를 돌아가며 켜고 끈다 (walk-scene.js drawLamps)
"""
import argparse
import json
import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

from sprite_slice import chroma_key, remove_specks, to_image

# 윈도우 콘솔(cp949)에서 이모지·특수기호를 못 찍어 멈추지 않게: 못 찍는 글자만 ? 로 바꾼다 (한글은 그대로)
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(errors="replace")
    except (AttributeError, ValueError):
        pass

PAD = 2


def largest_component(mask):
    """가장 큰 4-연결 덩어리의 (면적, bbox) — 없으면 None."""
    h, w = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    best = None
    ys, xs = np.nonzero(mask)
    for sy, sx in zip(ys.tolist(), xs.tolist()):
        if seen[sy, sx]:
            continue
        seen[sy, sx] = True
        q = deque([(sy, sx)])
        n, x0, y0, x1, y1 = 0, sx, sy, sx, sy
        while q:
            y, x = q.popleft()
            n += 1
            x0, x1, y0, y1 = min(x0, x), max(x1, x), min(y0, y), max(y1, y)
            for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    q.append((ny, nx))
        if best is None or n > best[0]:
            best = (n, (x0, y0, x1, y1))
    return best


def find_rect(mask, min_area):
    comp = largest_component(mask)
    if not comp or comp[0] < min_area:
        return None
    n, (x0, y0, x1, y1) = comp
    bw, bh = x1 - x0 + 1, y1 - y0 + 1
    if n / (bw * bh) < 0.85 or bw / bh < 2:
        return None
    return {"x": x0, "y": y0, "w": bw, "h": bh}


def glass_mask(color, alpha):
    r, g, b = color[..., 0], color[..., 1], color[..., 2]
    return (alpha > 0.5) & (b >= 236) & (g >= 190) & (r >= 60) & (r <= 165)


def lamp_mask(color, alpha):
    r, g, b = color[..., 0], color[..., 1], color[..., 2]
    return (alpha > 0.5) & (r >= 200) & (g >= 200) & (b <= 120) & (g - b >= 100)


def lamp_spots(mask, min_px=12):
    """전구 마스크의 덩어리마다 [중심 x, 중심 y, 반지름] (앱이 전구를 하나씩 켜고 끄는 애니메이션에 씀)"""
    h, w = mask.shape
    seen = np.zeros((h, w), dtype=bool)
    spots = []
    ys, xs = np.nonzero(mask)
    for sy, sx in zip(ys.tolist(), xs.tolist()):
        if seen[sy, sx]:
            continue
        seen[sy, sx] = True
        q = deque([(sy, sx)])
        pts = []
        while q:
            y, x = q.popleft()
            pts.append((y, x))
            for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    q.append((ny, nx))
        if len(pts) >= min_px:
            py, px = np.array(pts).T
            spots.append([round(float(px.mean()), 1), round(float(py.mean()), 1), round(float(np.sqrt(len(pts) / np.pi)), 1)])
    return spots


def dilate(mask, px):
    out = mask.copy()
    for _ in range(px):
        grown = out.copy()
        grown[1:] |= out[:-1]
        grown[:-1] |= out[1:]
        grown[:, 1:] |= out[:, :-1]
        grown[:, :-1] |= out[:, 1:]
        out = grown
    return out


def night_image(color, alpha, glass, lamps=None):
    r, g, b = color[..., 0], color[..., 1], color[..., 2]
    dark = color * np.array([0.42, 0.45, 0.62])
    lum = (0.3 * r + 0.59 * g + 0.11 * b) / 255.0
    warm = np.stack([255 * (0.85 + 0.15 * lum), 205 * (0.8 + 0.2 * lum), 110 * (0.7 + 0.3 * lum)], -1)
    night = np.where(glass[..., None], warm, dark)
    if lamps is not None and lamps.any():
        halo = dilate(lamps, 3) & ~lamps & (alpha > 0.5)
        night = np.where(halo[..., None], night * 0.55 + np.array([255, 205, 90]) * 0.45, night)
        night = np.where(lamps[..., None], np.minimum(255, color * 1.05 + 12), night)
    return to_image(night, alpha)


def write_manifest(out):
    manifest = {}
    for jf in sorted(Path(out).glob("*.json")):
        data = json.loads(jf.read_text(encoding="utf-8"))
        manifest[data["name"]] = data
    (Path(out) / "town.js").write_text(
        "// town_slice.py 가 생성 — 직접 수정하지 말 것\nwindow.BTCPET_TOWN = "
        + json.dumps(manifest, ensure_ascii=False, indent=2) + ";\n",
        encoding="utf-8",
    )


def slice_buildings(src, cols, rows, names, units, out, night=False, mask_from=None, masks=None, manifest=True, lamps=None):
    """시트 1장의 칸들을 건물로 저장. names: 칸 순서대로 이름(None/"-" 은 건너뜀).
    masks: 여러 시트에 걸쳐 창문 위치를 빌려 쓰기 위한 공유 dict. lamps: 밤에 노란 전구를 켤 건물 이름들.
    반환: [(meta, report)]"""
    src, out = Path(src), Path(out)
    out.mkdir(parents=True, exist_ok=True)
    mask_from = mask_from or {}
    lamps = set(lamps or ())
    masks = {} if masks is None else masks
    if len(names) != cols * rows:
        raise ValueError(f"칸 이름 개수({len(names)})가 칸 수({cols * rows})와 다릅니다")

    rgb = np.asarray(Image.open(src).convert("RGB")).astype(np.float64)
    m = np.minimum(rgb[..., 0], rgb[..., 2]) - rgb[..., 1]
    bg = rgb[m > 230].mean(axis=0)
    H, W = rgb.shape[:2]
    cw, ch = W / cols, H / rows
    results = []

    for idx, name in enumerate(names):
        if not name or name == "-":
            continue
        if name not in units:
            raise ValueError(f"{name} 의 높이(units)가 없습니다")
        c, r = idx % cols, idx // cols
        x0, y0 = round(c * cw), round(r * ch)
        x1, y1 = round((c + 1) * cw), round((r + 1) * ch)
        cell = rgb[y0:y1, x0:x1]
        color, alpha = chroma_key(cell, bg)
        alpha = remove_specks(alpha)
        solid = alpha > 0.5
        if not solid.any():
            raise ValueError(f"{name}: 빈 칸 (row {r} col {c})")
        rows_i = np.nonzero(solid.any(axis=1))[0]
        cols_i = np.nonzero(solid.any(axis=0))[0]
        t, b = max(0, rows_i[0] - PAD), min(cell.shape[0], rows_i[-1] + 1 + PAD)
        l, rr = max(0, cols_i[0] - PAD), min(cell.shape[1], cols_i[-1] + 1 + PAD)
        color, alpha, crop = color[t:b, l:rr], alpha[t:b, l:rr], cell[t:b, l:rr]

        img = to_image(color, alpha)
        img.save(out / f"{name}.png", optimize=True)
        night_file = None
        glass_ratio = None
        if night:
            glass = glass_mask(color, alpha)
            src_name = mask_from.get(name)
            if src_name:
                borrowed = masks.get(src_name)
                if borrowed is None or borrowed.shape != glass.shape:
                    raise ValueError(f"{name}: 창문 위치를 빌릴 {src_name} 는 먼저 처리된 같은 크기 건물이어야 합니다")
                glass = borrowed & (alpha > 0.5)
            masks[name] = glass
            glass_ratio = float(glass.sum() / max(1, (alpha > 0.5).sum()))
            night_file = f"{name}_night.png"
            night_image(color, alpha, glass, lamp_mask(color, alpha) if name in lamps else None).save(out / night_file, optimize=True)

        cr, cg, cb = crop[..., 0], crop[..., 1], crop[..., 2]
        opaque = alpha > 0.9
        mx, mn = np.maximum(np.maximum(cr, cg), cb), np.minimum(np.minimum(cr, cg), cb)
        screen_mask = opaque & (mx >= 40) & (mx <= 80) & (mx - mn <= 10)
        sign_mask = opaque & (cr > 238) & (cg > 230) & (cb > 200) & (cb < 242) & (cr - cb > 10)
        min_area = img.width * img.height * 0.004
        screen = find_rect(screen_mask, min_area)
        # 전광판 테두리 색: 화면 사각형 왼쪽 바깥 띠(4~12px)의 중앙값
        # → 코드로 더 큰 전광판을 그릴 때 건물 그림과 같은 색으로 맞추는 용도
        frame_color = None
        frame_px = None
        if screen:
            # 테두리 두께(검은 외곽선 포함): 화면 중앙 높이에서 왼쪽으로 불투명이 끝나는 곳까지
            my, fx = screen["y"] + screen["h"] // 2, screen["x"] - 1
            while fx >= 0 and alpha[my, fx] > 0.5:
                fx -= 1
            frame_px = screen["x"] - 1 - fx
            ys = slice(screen["y"] + screen["h"] // 4, screen["y"] + screen["h"] * 3 // 4)
            xs = slice(max(0, screen["x"] - 12), max(0, screen["x"] - 4))
            band = crop[ys, xs][opaque[ys, xs]]
            if band.size:
                frame_color = [int(v) for v in np.median(band, axis=0)]
        meta = {
            "name": name,
            "image": f"{name}.png",
            "nightImage": night_file,
            "source": src.name,
            "cell": [c, r],
            "width": img.width,
            "height": img.height,
            "heightUnits": units[name],
            "anchor": "bottom-center",
            "screen": screen,
            "screenFrameColor": frame_color,
            "screenFramePx": frame_px,
            "sign": find_rect(sign_mask, min_area),
            "lamps": lamp_spots(lamp_mask(color, alpha)) if name in lamps else None,
        }
        (out / f"{name}.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
        leftover = int((opaque & (color[..., 0] > 180) & (color[..., 2] > 180) & (color[..., 1] < 90)).sum())
        results.append((meta, {"glassRatio": glass_ratio, "leftoverRatio": leftover / max(1, int(opaque.sum()))}))

    if manifest:
        write_manifest(out)
    return results


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("input")
    ap.add_argument("--cols", type=int, required=True)
    ap.add_argument("--rows", type=int, required=True)
    ap.add_argument("--names", required=True, help="칸 순서대로 건물 이름, 건너뛸 칸은 - (예: home,office,-,-)")
    ap.add_argument("--units", required=True, help="건물 높이 = 캐릭터 키의 배수 (예: home=2,office=3)")
    ap.add_argument("--out", required=True)
    ap.add_argument("--night", action="store_true", help="밤 버전 {name}_night.png 도 생성")
    ap.add_argument("--night-mask-from", default="", help="창문 위치를 빌릴 건물 (예: bitget=upbit)")
    args = ap.parse_args()
    names = [n.strip() for n in args.names.split(",")]
    units = {k.strip(): float(v) for k, v in (kv.split("=") for kv in args.units.split(","))}
    mask_from = dict(kv.split("=") for kv in args.night_mask_from.split(",") if "=" in kv)
    try:
        results = slice_buildings(args.input, args.cols, args.rows, names, units, args.out, args.night, mask_from)
    except ValueError as e:
        raise SystemExit(str(e))
    for meta, _ in results:
        print(f"{meta['name']:8s} {meta['width']}x{meta['height']}  units {meta['heightUnits']}  screen {meta['screen']}  sign {meta['sign']}")


if __name__ == "__main__":
    main()
