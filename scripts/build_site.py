"""Assemble the static FinalForge website (GitHub Pages) from web/.

    python scripts/build_site.py [out_dir]      (default: _site)

The site is the same UI as the app, switched to website mode: no server, courses are imported as
knowledge packs and kept in the visitor's browser. Only the demo pack is published; real course
packs are never part of the site.
"""
from __future__ import annotations

import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def build(out: Path) -> None:
    if out.exists():
        shutil.rmtree(out)
    shutil.copytree(ROOT / "web", out)
    (out / "config.js").write_text(
        '// Built by scripts/build_site.py: website mode (no server).\nwindow.FINALFORGE_MODE = "static";\n',
        encoding="utf-8")
    shutil.copy(ROOT / "samples" / "demo_pack.json", out / "demo_pack.json")
    (out / ".nojekyll").write_text("", encoding="utf-8")  # serve files as-is
    files = sum(1 for p in out.rglob("*") if p.is_file())
    print(f"built {out} ({files} files)")


if __name__ == "__main__":
    build(Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "_site")
