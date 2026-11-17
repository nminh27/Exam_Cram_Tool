"""Command-line tools for building courses without the API (used by Claude Code).

    python -m app.packcli list                                  courses with ids and sizes
    python -m app.packcli materials <course_id>                 uploaded files (kind + path) to read
    python -m app.packcli validate <pack.json>                  check a pack, print errors / warnings
    python -m app.packcli import <pack.json>                    create a new course from a pack
    python -m app.packcli import <pack.json> --into <course_id> merge into an existing course (keeps progress)
    python -m app.packcli import <pack.json> --into <id> --replace   replace that course's knowledge
    python -m app.packcli dump <course_id> <out.json>           write a course's current knowledge as a pack

The running app picks up changes on the next page load; no restart needed.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from . import packkit, storage


def _load(path: str) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def _report(errors: list[str], warnings: list[str]) -> None:
    for w in warnings:
        print("warning:", w)
    for e in errors:
        print("ERROR:", e)
    print(f"{len(errors)} error(s), {len(warnings)} warning(s)")


def cmd_list(_: argparse.Namespace) -> int:
    for c in storage.list_courses():
        s = c["stats"]
        print(f"{c['id']:40} {c['name']}  ({len(c['materials'])} files, {s['concepts']} concepts, "
              f"{s['patterns']} patterns, {s['mcqs']} MCQs, {s['problems']} problems)")
    return 0


def cmd_materials(a: argparse.Namespace) -> int:
    meta = storage.get_course(a.course_id)
    for m in meta["materials"]:
        pages = f"{m['pages']} pages" if m.get("pages") else ""
        print(f"{m['id']}  [{m['kind']}]  {m['filename']}  {pages}\n    {storage.material_path(a.course_id, m)}")
    if not meta["materials"]:
        print("(no uploaded files)")
    return 0


def cmd_validate(a: argparse.Namespace) -> int:
    pack = _load(a.pack)
    errors, warnings = packkit.validate(pack)
    _report(errors, warnings)
    return 1 if errors else 0


def cmd_import(a: argparse.Namespace) -> int:
    pack = _load(a.pack)
    if "knowledge" not in pack:
        print("Not a finalforge pack (no 'knowledge').")
        return 1
    kn_new = packkit.finalize(pack["knowledge"])
    if a.into:
        with storage.lock_for(a.into):
            meta = storage.get_course(a.into)
            base = storage.get_knowledge(a.into)
            kn = kn_new if a.replace else packkit.merge(base, kn_new)
            errors, warnings = packkit.validate(kn)
            _report(errors, warnings)
            if errors and not a.force:
                print("Not imported (fix the errors or pass --force).")
                return 1
            full = storage.empty_knowledge()
            full.update(kn)
            full["generated_at"] = storage.now()
            storage.save_knowledge(a.into, full)
        print(f"{'Replaced' if a.replace else 'Merged into'} course {a.into} ({meta['name']}).")
        return 0
    errors, warnings = packkit.validate(kn_new)
    _report(errors, warnings)
    if errors and not a.force:
        print("Not imported (fix the errors or pass --force).")
        return 1
    meta = storage.create_course(a.name or pack.get("name") or "Imported course", pack.get("description", ""))
    full = storage.empty_knowledge()
    full.update(kn_new)
    full["generated_at"] = storage.now()
    storage.save_knowledge(meta["id"], full)
    print(f"Created course {meta['id']} ({meta['name']}).")
    return 0


def cmd_dump(a: argparse.Namespace) -> int:
    meta = storage.get_course(a.course_id)
    pack = {"format": packkit.PACK_FORMAT, "version": 1, "name": meta["name"],
            "description": meta.get("description", ""), "knowledge": storage.get_knowledge(a.course_id)}
    Path(a.out).write_text(json.dumps(pack, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"wrote {a.out}")
    return 0


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="python -m app.packcli", description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("list").set_defaults(fn=cmd_list)
    s = sub.add_parser("materials"); s.add_argument("course_id"); s.set_defaults(fn=cmd_materials)
    s = sub.add_parser("validate"); s.add_argument("pack"); s.set_defaults(fn=cmd_validate)
    s = sub.add_parser("import"); s.add_argument("pack"); s.add_argument("--into"); s.add_argument("--name")
    s.add_argument("--replace", action="store_true"); s.add_argument("--force", action="store_true")
    s.set_defaults(fn=cmd_import)
    s = sub.add_parser("dump"); s.add_argument("course_id"); s.add_argument("out"); s.set_defaults(fn=cmd_dump)
    a = p.parse_args(argv)
    try:
        return a.fn(a)
    except KeyError as e:
        print(f"Not found: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
