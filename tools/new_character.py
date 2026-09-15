"""
new_character.py — 산책 모드 새 캐릭터 준비: 폴더 + 레시피 틀 + AI(Astra 등) 프롬프트 파일 생성 (빌드 제외 도구)

  python tools/new_character.py cat "야근냥이" "a tired office-worker calico cat wearing a loose red tie"
  python tools/new_character.py cat "야근냥이" "..." --fixed "two pointed ears, clearly separated; exactly ONE red tie on the chest"

만들어지는 것 (art-src/characters/<key>/)
  character.json     레시피 틀 (동작별 파일 이름·fps·속도는 출근개미 확정값으로 채워 둠)
  prompts/00~05_*.md 단계별 프롬프트 (첨부할 파일·저장 이름·확인 목록 포함)
  README.md          진행 순서

다 뽑은 뒤: python tools/build_assets.py --only <key>  → 미리보기: tools/walk-preview.html?char=<key>
템플릿 원본: tools/prompts/character/ (교훈이 쌓이면 여기를 고치면 다음 캐릭터부터 반영)
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
TEMPLATES = Path(__file__).resolve().parent / "prompts" / "character"
STEPS = ["00_concepts", "01_turnaround", "02_walk", "03_idle", "04_run", "05_trudge"]
DEFAULT_FIXED = [
    "Head shape and any ears, antennae, horns or hair: same positions, same count, clearly separated from each other.",
    "Every accessory and clothing item (tie, scarf, badge, hat...): same count and same place as the reference.",
]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("key", help="영문 소문자·숫자·_ (폴더·파일 이름, 예: cat)")
    ap.add_argument("name", help="보여줄 이름 (예: 야근냥이)")
    ap.add_argument("description", help="외형 설명 — 영어 권장 (예: a tired office-worker calico cat wearing a loose red tie)")
    ap.add_argument("--fixed", default="", help="모든 동작에서 모양을 고정할 부분, ; 로 구분 (예: two ears; one red tie)")
    ap.add_argument("--force", action="store_true", help="이미 있는 폴더면 프롬프트·README 만 다시 만든다 (레시피는 유지)")
    args = ap.parse_args()

    if not re.fullmatch(r"[a-z0-9_]+", args.key):
        sys.exit("key 는 영문 소문자·숫자·_ 만 쓸 수 있어요")
    folder = ROOT / "art-src" / "characters" / args.key
    if folder.exists() and not args.force:
        sys.exit(f"이미 있어요: {folder.relative_to(ROOT)} (프롬프트만 다시 만들려면 --force)")
    (folder / "prompts").mkdir(parents=True, exist_ok=True)

    fixed = [f.strip() for f in args.fixed.split(";") if f.strip()] or DEFAULT_FIXED
    values = {
        "key": args.key,
        "name": args.name,
        "description": args.description,
        "fixed_parts": "\n".join(f"- {f}" for f in fixed),
    }
    values["common"] = Template((TEMPLATES / "_common.md").read_text(encoding="utf-8")).safe_substitute(values).strip()
    for step in STEPS:
        text = Template((TEMPLATES / f"{step}.md").read_text(encoding="utf-8")).safe_substitute(values)
        (folder / "prompts" / f"{step}.md").write_text(text, encoding="utf-8")

    recipe_path = folder / "character.json"
    if not recipe_path.exists():
        k = args.key
        recipe = {
            "key": k,
            "name": args.name,
            "description": args.description,
            "headWidth": 140,
            "animations": {
                "walk":   {"file": f"{k}_walk.png",   "cols": 4, "rows": 2, "fps": 10, "speed": 40, "ground": "cell"},
                "idle":   {"file": f"{k}_idle.png",   "cols": 4, "rows": 2, "fps": 6,  "speed": 0,  "ground": "cell", "rowsRepeat": True},
                "run":    {"file": f"{k}_run.png",    "cols": 4, "rows": 2, "fps": 12, "speed": 90, "ground": "row",  "rowsRepeat": True},
                "trudge": {"file": f"{k}_trudge.png", "cols": 4, "rows": 2, "fps": 7,  "speed": 20, "ground": "cell"},
            },
        }
        recipe_path.write_text(json.dumps(recipe, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    (folder / "README.md").write_text(f"""# {args.name} (`{args.key}`)

{args.description}

## 진행 순서
1. `prompts/00_concepts.md` — 시안 4개 → 하나 골라 `{args.key}_concept_pick.png`
2. `prompts/01_turnaround.md` — 4면도 `{args.key}_turnaround.png`
3. `prompts/02_walk.md` → `{args.key}_walk.png`
4. `prompts/03_idle.md` → `{args.key}_idle.png`
5. `prompts/04_run.md` → `{args.key}_run.png`
6. `prompts/05_trudge.md` → `{args.key}_trudge.png`
7. 변환 + 품질 검사: `python tools/build_assets.py --only {args.key}`
8. 미리보기: `tools/walk-preview.html?char={args.key}` (fps·속도가 어색하면 `character.json` 수정 후 7번 다시)
9. 앱: 우클릭 메뉴 > 산책 캐릭터 > {args.name}

## 파일 이름을 바꿔 저장했다면
`character.json` 의 `animations.<동작>.file` 을 실제 파일 이름으로 고치면 된다.
""", encoding="utf-8")

    print(f"준비 완료: {folder.relative_to(ROOT)}")
    for step in STEPS:
        print(f"  prompts/{step}.md")
    print(f"다음: prompts/00_concepts.md 부터 차례대로 → 다 뽑으면 python tools/build_assets.py --only {args.key}")


if __name__ == "__main__":
    main()
