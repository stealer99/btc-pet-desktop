"""
sprite_slice.py — AI가 격자로 뽑은 스프라이트 시트(단색 마젠타 배경)를 앱용 가로 시트로 변환.

  python tools/sprite_slice.py art-src/characters/chulgeun/chulgeun_ant_walk_cycle.png ^
      --cols 4 --rows 2 --name walk_a --out art-src/characters/chulgeun/out
  (보통은 레시피로 한 번에: python tools/build_assets.py — 이 파일의 slice_sheet() 를 쓴다)

칸마다 처리 순서:
  1. 크로마키: 마젠타 정도 m = min(R,B) - G 로 알파 산출
     (실측: 배경 m≈244, 캐릭터 m<20 → 그 사이만 반투명 경계)
  2. 반투명 경계 역합성(unpremultiply) → 분홍 테두리(스필) 제거
  3. 잡티 제거: 가장 큰 덩어리 면적의 2% 미만 덩어리 삭제
  4. 정렬 기준 측정
     - 발 기준선 (--ground)
         cell: 칸마다 불투명 최하단 = 땅 (걷기·서있기처럼 한 발은 항상 땅에 닿는 동작)
         row : 같은 줄 칸들의 최하단 중 가장 낮은 값 = 그 줄의 땅
               (달리기·점프처럼 두 발이 다 뜨는 프레임이 있는 동작 — AI가 그린 체공 높이 보존)
     - 가로 기준: 머리 띠(bbox 높이 25~50% 구간)의 무게중심
       → 다리·배·팔이 움직여도 머리는 고정돼 보이게
  5. 배율: 머리 폭을 --head-width 로 맞춘다
     → 걷기/달리기/앉기 등 시트마다 AI가 그린 크기가 달라도 캐릭터 크기 통일

출력 (--out 폴더):
  {name}.png   가로 시트 (프레임 고정 크기, anchorX = 프레임 가로 중앙)
  {name}.json  메타 (프레임 수, 크기, 기준선, fps …)
  sprites.js   폴더 내 모든 json 을 모은 매니페스트 (tools/walk-preview.html 이 로드)
"""
import argparse
import json
import sys
import math
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

# 윈도우 콘솔(cp949)에서 이모지·특수기호를 못 찍어 멈추지 않게: 못 찍는 글자만 ? 로 바꾼다 (한글은 그대로)
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(errors="replace")
    except (AttributeError, ValueError):
        pass

KEY_LO = 25    # m 이 이 값 이하 → 완전 불투명
KEY_HI = 225   # m 이 이 값 이상 → 완전 투명
SPECK_RATIO = 0.02
HEAD_BAND = (0.25, 0.50)
PAD_SIDE = 4
PAD_TOP = 4
PAD_BOTTOM = 2


def chroma_key(rgb, bg):
    """rgb: float HxWx3 (0~255) → RGBA float (알파 0~1, 색은 역합성 적용)."""
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    m = np.minimum(r, b) - g
    alpha = 1.0 - np.clip((m - KEY_LO) / (KEY_HI - KEY_LO), 0.0, 1.0)
    # 관측색 P = a*C + (1-a)*BG  →  C = (P - (1-a)*BG) / a
    safe = np.maximum(alpha, 1e-3)[..., None]
    color = (rgb - (1.0 - alpha)[..., None] * bg) / safe
    color = np.clip(color, 0, 255)
    return color, alpha


def remove_specks(alpha):
    mask = alpha > 0.5
    h, w = mask.shape
    labels = np.zeros((h, w), dtype=np.int32)
    sizes = [0]
    ys, xs = np.nonzero(mask)
    for sy, sx in zip(ys.tolist(), xs.tolist()):
        if labels[sy, sx]:
            continue
        lab = len(sizes)
        labels[sy, sx] = lab
        q = deque([(sy, sx)])
        n = 0
        while q:
            y, x = q.popleft()
            n += 1
            for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not labels[ny, nx]:
                    labels[ny, nx] = lab
                    q.append((ny, nx))
        sizes.append(n)
    if len(sizes) <= 1:
        return alpha
    sizes = np.array(sizes)
    keep = sizes >= sizes.max() * SPECK_RATIO
    keep[0] = False
    kept = keep[labels]
    # 반투명 경계(알파 0.5 이하)는 살아남은 덩어리 근처일 때만 유지: 3px 팽창으로 판정
    near = kept.copy()
    for _ in range(3):
        grown = near.copy()
        grown[1:, :] |= near[:-1, :]
        grown[:-1, :] |= near[1:, :]
        grown[:, 1:] |= near[:, :-1]
        grown[:, :-1] |= near[:, 1:]
        near = grown
    return np.where(near, alpha, 0.0)


def measure(alpha):
    """불투명 bbox, 발 기준선, 머리 무게중심 x, 머리 폭 (원본 칸 좌표)."""
    solid = alpha > 0.5
    rows = np.nonzero(solid.any(axis=1))[0]
    cols = np.nonzero(solid.any(axis=0))[0]
    top, bottom = int(rows[0]), int(rows[-1])
    left, right = int(cols[0]), int(cols[-1])
    hgt = bottom - top + 1
    band = slice(top + int(hgt * HEAD_BAND[0]), top + int(hgt * HEAD_BAND[1]))
    band_alpha = alpha[band]
    xs = np.arange(alpha.shape[1])
    anchor_x = float((band_alpha * xs).sum() / band_alpha.sum())
    widths = []
    for row in solid[band]:
        idx = np.nonzero(row)[0]
        if idx.size:
            widths.append(idx[-1] - idx[0] + 1)
    head_w = float(np.median(widths))
    return {"bbox": (left, top, right, bottom), "baseline": bottom, "anchorX": anchor_x, "headWidth": head_w}


def to_image(color, alpha):
    rgba = np.dstack([color, alpha * 255.0]).round().clip(0, 255).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA")


def resize_rgba(img, size):
    # 프리멀티플라이 상태로 리샘플해야 투명 경계에 검은/분홍 테두리가 안 생긴다
    return img.convert("RGBa").resize(size, Image.LANCZOS).convert("RGBA")


def head_offset(img, anchor_x):
    """머리(맨 위 60px 띠) 무게중심이 발바닥 중앙(anchorX)에서 얼마나 벗어났는지 px. + 면 오른쪽.
    기울기 확인용 — 발 모양에 휘둘리지 않게 머리만 본다 (발로 재면 값이 엉킨다)."""
    a = np.asarray(img).astype(np.float64)[..., 3] / 255 > 0.5
    ys, xs = np.nonzero(a)
    if not len(ys):
        return 0.0
    band = a[ys.min():ys.min() + 60]
    return float(np.nonzero(band)[1].mean() - anchor_x)


def slice_sheet(src, cols, rows, name, out, head_width=140, fps=10, speed=0, ground="cell", once=False,
                write_manifest=True, lean=None, shift=None, order=None):
    """격자 시트 1장 → {name}.png/.json. 반환: (meta, report) — report 는 품질 검사용 측정값."""
    src, out = Path(src), Path(out)
    out.mkdir(parents=True, exist_ok=True)

    rgb = np.asarray(Image.open(src).convert("RGB")).astype(np.float64)
    m = np.minimum(rgb[..., 0], rgb[..., 2]) - rgb[..., 1]
    bg = rgb[m > 230].mean(axis=0)

    H, W = rgb.shape[:2]
    cw, ch = W / cols, H / rows
    cells = []
    leftover = 0
    opaque_total = 0
    for r in range(rows):
        for c in range(cols):
            x0, y0 = round(c * cw), round(r * ch)
            x1, y1 = round((c + 1) * cw), round((r + 1) * ch)
            color, alpha = chroma_key(rgb[y0:y1, x0:x1], bg)
            alpha = remove_specks(alpha)
            if not (alpha > 0.5).any():
                raise ValueError(f"빈 칸: row {r} col {c} (격자 칸 수가 맞는지 확인)")
            info = measure(alpha)
            info["cell"] = [c, r]
            info["cellHeight"] = y1 - y0
            info["sourceBottom"] = info["baseline"]
            opaque = alpha > 0.9
            opaque_total += int(opaque.sum())
            # 배경 제거 후에도 남은 진한 마젠타 (배경색이 캐릭터에 번졌거나 캐릭터에 분홍·보라가 있는 경우)
            leftover += int((opaque & (color[..., 0] > 180) & (color[..., 2] > 180) & (color[..., 1] < 90)).sum())
            cells.append((to_image(color, alpha), info))

    if ground == "row":
        for r in range(rows):
            row_cells = [i for _, i in cells if i["cell"][1] == r]
            g = max(i["baseline"] for i in row_cells)
            for i in row_cells:
                i["baseline"] = g

    # 레시피 order: 칸을 재생 순서대로 늘어놓는다 (1부터 센 칸 번호).
    # 예) 눈 깜빡임이 3번 칸이면 [1,2,1,4,1,2,3,4] → 한 주기에 한 번만 깜빡인다
    if order:
        picked = []
        for n in order:
            if not 1 <= int(n) <= len(cells):
                raise ValueError(f"order 의 칸 번호 {n} 이(가) 범위를 벗어났어요 (칸 {len(cells)}개)")
            picked.append(cells[int(n) - 1])
        cells = picked

    scale = head_width / float(np.median([i["headWidth"] for _, i in cells]))

    # 모든 프레임을 담을 공통 프레임 크기 (anchorX 가 가로 중앙 → 좌우 반전해도 머리 위치 불변)
    half_w = max(max(i["anchorX"] - i["bbox"][0], i["bbox"][2] + 1 - i["anchorX"]) for _, i in cells) * scale
    above = max(i["baseline"] - i["bbox"][1] + 1 for _, i in cells) * scale
    frame_w = 2 * math.ceil(half_w + PAD_SIDE)
    frame_h = math.ceil(above) + PAD_TOP + PAD_BOTTOM
    if lean or shift:                                   # 기울이거나 옆으로 밀면 옆으로 더 필요
        frame_w += 2 * math.ceil(frame_h * 0.3)
    anchor_x = frame_w // 2
    baseline_y = frame_h - PAD_BOTTOM  # 발바닥이 닿는 y (이 행 바로 위까지 그려짐)

    sheet = Image.new("RGBA", (frame_w * len(cells), frame_h), (0, 0, 0, 0))
    frame_info = []
    for idx, (img, info) in enumerate(cells):
        sw, sh = max(1, round(img.width * scale)), max(1, round(img.height * scale))
        scaled = resize_rgba(img, (sw, sh))
        dx = round(anchor_x - info["anchorX"] * scale)
        dy = round(baseline_y - (info["baseline"] + 1) * scale)
        # 빈 프레임에 한 장만 올리므로 마스크 없는 paste 가 정확 (음수 오프셋은 자동으로 잘림)
        frame = Image.new("RGBA", (frame_w, frame_h), (0, 0, 0, 0))
        frame.paste(scaled, (dx, dy))
        # 레시피 lean/shift: 프레임별로 발바닥 중앙을 축으로 기울이고(도, + 면 오른쪽) 무게 이동만큼 옆으로 민다.
        # AI 는 좌우 대칭을 잘 못 맞춰서(한쪽만 크게 기울임) 부족한 쪽을 여기서 채운다. 1도 ≈ 머리 2.5px
        if lean:
            deg = float(lean[idx % len(lean)])
            if deg:
                frame = frame.rotate(-deg, resample=Image.BICUBIC, center=(anchor_x, baseline_y))
        if shift:
            moved = Image.new("RGBA", (frame_w, frame_h), (0, 0, 0, 0))
            moved.paste(frame, (round(float(shift[idx % len(shift)])), 0))
            frame = moved
        sheet.paste(frame, (idx * frame_w, 0))
        frame_info.append({
            "cell": info["cell"],
            "sourceBbox": list(info["bbox"]),
            "sourceHeadWidth": round(info["headWidth"], 1),
        })

    sheet_path = out / f"{name}.png"
    sheet.save(sheet_path, optimize=True)
    content_h = round(max(i["baseline"] - i["bbox"][1] + 1 for _, i in cells) * scale)
    meta = {
        "name": name,
        "image": sheet_path.name,
        "source": src.name,
        "frames": len(cells),
        "frameWidth": frame_w,
        "frameHeight": frame_h,
        "anchorX": anchor_x,
        "baselineY": baseline_y,
        "contentHeight": content_h,
        "headWidth": head_width,
        "scale": round(scale, 5),
        "fps": fps,
        "speed": speed,
        "ground": ground,
        "loop": not once,
        "facing": "right",
        "frameInfo": frame_info,
    }
    (out / f"{name}.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")

    if write_manifest:
        manifest = {}
        for jf in sorted(out.glob("*.json")):
            data = json.loads(jf.read_text(encoding="utf-8"))
            manifest[data["name"]] = data
        (out / "sprites.js").write_text(
            "// sprite_slice.py 가 생성 — 직접 수정하지 말 것\nwindow.BTCPET_SPRITES = "
            + json.dumps(manifest, ensure_ascii=False, indent=2) + ";\n",
            encoding="utf-8",
        )

    sheet_alpha = np.asarray(sheet)[..., 3] > 128
    report = {
        "cols": cols, "rows": rows, "background": bg.round(1).tolist(),
        "headWidths": [i["headWidth"] for _, i in cells],
        "sourceBottoms": [(i["cell"][1], i["sourceBottom"], i["cellHeight"]) for _, i in cells],
        "leftoverRatio": leftover / max(1, opaque_total),
        "frameMasks": [sheet_alpha[:, k * frame_w:(k + 1) * frame_w] for k in range(len(cells))],
    }
    return meta, report


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("input")
    ap.add_argument("--cols", type=int, default=4)
    ap.add_argument("--rows", type=int, default=2)
    ap.add_argument("--name", required=True, help="출력 이름 (예: walk_a)")
    ap.add_argument("--out", required=True, help="출력 폴더")
    ap.add_argument("--head-width", type=float, default=140, help="출력 시트에서 머리 폭(px)")
    ap.add_argument("--ground", choices=["cell", "row"], default="cell", help="발 기준선: 칸별 최하단 / 줄별 최하단")
    ap.add_argument("--fps", type=float, default=10)
    ap.add_argument("--speed", type=float, default=0, help="캐릭터 키 72px 기준 이동 속도(px/s). 0 = 제자리 동작")
    ap.add_argument("--once", action="store_true", help="반복 없이 1회 재생 동작")
    args = ap.parse_args()
    try:
        meta, report = slice_sheet(args.input, args.cols, args.rows, args.name, args.out, args.head_width,
                                   args.fps, args.speed, args.ground, args.once)
    except ValueError as e:
        raise SystemExit(str(e))
    print(f"{Path(args.out) / meta['image']}  {meta['frames']} frames × {meta['frameWidth']}x{meta['frameHeight']}  "
          f"scale {meta['scale']:.3f}  bg {report['background']}")
    for fi in meta["frameInfo"]:
        print("  cell", fi["cell"], "bbox", fi["sourceBbox"], "head", fi["sourceHeadWidth"])


if __name__ == "__main__":
    main()
