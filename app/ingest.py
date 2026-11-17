"""Turn an uploaded file into Claude content blocks.

PDFs and images are sent natively (Claude reads the page images, so formulas, tables and
diagrams survive). Word / PowerPoint / text files are converted to plain text.
Large PDFs are split into page-range chunks.
"""
from __future__ import annotations

import base64
import io
from pathlib import Path

from . import config

TEXT_EXT = {".txt", ".md", ".csv", ".tex", ".json", ".rtf"}
IMAGE_EXT = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
             ".gif": "image/gif", ".webp": "image/webp"}
SUPPORTED_EXT = TEXT_EXT | set(IMAGE_EXT) | {".pdf", ".docx", ".pptx"}


def page_count(path: Path) -> int | None:
    if path.suffix.lower() != ".pdf":
        return None
    try:
        from pypdf import PdfReader
        return len(PdfReader(str(path)).pages)
    except Exception:
        return None


def _b64(data: bytes) -> str:
    return base64.standard_b64encode(data).decode("ascii")


def _text_block(text: str, title: str) -> dict:
    return {
        "type": "document",
        "source": {"type": "text", "media_type": "text/plain", "data": text or "(empty file)"},
        "title": title[:200],
    }


def _docx_text(path: Path) -> str:
    import docx  # python-docx

    d = docx.Document(str(path))
    parts = [p.text for p in d.paragraphs if p.text.strip()]
    for ti, table in enumerate(d.tables, 1):
        parts.append(f"\n[Table {ti}]")
        for row in table.rows:
            parts.append(" | ".join(c.text.strip() for c in row.cells))
    return "\n".join(parts)


def _pptx_text(path: Path) -> str:
    from pptx import Presentation

    prs = Presentation(str(path))
    out = []
    for i, slide in enumerate(prs.slides, 1):
        out.append(f"\n=== Slide {i} ===")
        for shape in slide.shapes:
            if getattr(shape, "has_text_frame", False) and shape.text_frame.text.strip():
                out.append(shape.text_frame.text)
            if getattr(shape, "has_table", False):
                for row in shape.table.rows:
                    out.append(" | ".join(c.text.strip() for c in row.cells))
        if slide.has_notes_slide and slide.notes_slide.notes_text_frame.text.strip():
            out.append("[Speaker notes] " + slide.notes_slide.notes_text_frame.text)
    return "\n".join(out)


def material_chunks(path: Path, title: str) -> list[dict]:
    """Return [{"label": str, "blocks": [content blocks]}]. Usually a single chunk."""
    ext = path.suffix.lower()
    if ext == ".pdf":
        return _pdf_chunks(path, title)
    if ext in IMAGE_EXT:
        return [{"label": title, "blocks": [{
            "type": "image",
            "source": {"type": "base64", "media_type": IMAGE_EXT[ext], "data": _b64(path.read_bytes())},
        }]}]
    if ext == ".docx":
        return [{"label": title, "blocks": [_text_block(_docx_text(path), title)]}]
    if ext == ".pptx":
        return [{"label": title, "blocks": [_text_block(_pptx_text(path), title)]}]
    # Fallback: treat as text
    text = path.read_bytes().decode("utf-8", errors="replace")
    return [{"label": title, "blocks": [_text_block(text, title)]}]


def _pdf_chunks(path: Path, title: str) -> list[dict]:
    data = path.read_bytes()
    n = page_count(path) or 0
    if n <= config.PDF_CHUNK_PAGES and len(data) <= config.PDF_MAX_BYTES_PER_REQUEST:
        return [{"label": title, "blocks": [_pdf_block(data, title)]}]

    from pypdf import PdfReader, PdfWriter

    reader = PdfReader(str(path))
    size = max(10, config.PDF_CHUNK_PAGES)
    chunks = []
    for start in range(0, n, size):
        end = min(n, start + size)
        w = PdfWriter()
        for i in range(start, end):
            w.add_page(reader.pages[i])
        buf = io.BytesIO()
        w.write(buf)
        label = f"{title} (pages {start + 1}-{end})"
        chunks.append({"label": label, "blocks": [_pdf_block(buf.getvalue(), label)],
                       "page_offset": start})
    return chunks


def _pdf_block(data: bytes, title: str) -> dict:
    return {
        "type": "document",
        "source": {"type": "base64", "media_type": "application/pdf", "data": _b64(data)},
        "title": title[:200],
    }
