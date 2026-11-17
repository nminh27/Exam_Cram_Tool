"""Turn an uploaded file into model content blocks (Anthropic block format; app/providers.py converts
them for other APIs).

* native_pdf=True (Claude): PDFs are sent as documents; the model sees page images and text, so
  formulas, tables and diagrams survive. Large PDFs are split into page-range chunks.
* native_pdf=False (other providers): each PDF page becomes text; pages with no text layer (scans,
  handwriting) become page images, or every page does with pdf_mode="images".
Word / PowerPoint / text files are always converted to plain text.
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


def material_chunks(path: Path, title: str, native_pdf: bool = True, pdf_mode: str = "auto") -> list[dict]:
    """Return [{"label": str, "blocks": [content blocks]}]. Usually a single chunk."""
    ext = path.suffix.lower()
    if ext == ".pdf":
        return _pdf_chunks(path, title) if native_pdf else _pdf_portable_chunks(path, title, pdf_mode)
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


# ---------------------------------------------------------------- PDFs for non-Claude providers

IMAGES_PER_CHUNK = 16       # many APIs cap images per request
MIN_TEXT_CHARS = 40         # a page with less text than this is treated as a scan
RENDER_SCALE = 2.0          # ~144 dpi: readable formulas without huge payloads


def _render_page_jpeg(path: Path, index: int) -> bytes | None:
    try:
        import pypdfium2 as pdfium
    except ImportError:
        return None
    pdf = pdfium.PdfDocument(str(path))
    try:
        img = pdf[index].render(scale=RENDER_SCALE).to_pil().convert("RGB")
        buf = io.BytesIO()
        img.save(buf, "JPEG", quality=82)
        return buf.getvalue()
    finally:
        pdf.close()


def _pdf_portable_chunks(path: Path, title: str, pdf_mode: str) -> list[dict]:
    from pypdf import PdfReader

    reader = PdfReader(str(path))
    n = len(reader.pages)
    pages: list[tuple[int, list[dict], bool]] = []  # (page no, blocks, is_image)
    for i in range(n):
        try:
            text = reader.pages[i].extract_text() or ""
        except Exception:  # noqa: BLE001 - damaged page: fall back to an image
            text = ""
        as_image = pdf_mode == "images" or (pdf_mode == "auto" and len(text.strip()) < MIN_TEXT_CHARS)
        jpeg = _render_page_jpeg(path, i) if as_image and pdf_mode != "text" else None
        if jpeg:
            blocks = [{"type": "text", "text": f"=== {title}: page {i + 1} (image) ==="},
                      {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": _b64(jpeg)}}]
            pages.append((i + 1, blocks, True))
        else:
            pages.append((i + 1, [{"type": "text", "text": f"=== {title}: page {i + 1} ===\n{text}"}], False))

    chunks: list[dict] = []
    cur: list[tuple[int, list[dict], bool]] = []

    def flush() -> None:
        if cur:
            label = title if len(cur) == n else f"{title} (pages {cur[0][0]}-{cur[-1][0]})"
            chunks.append({"label": label, "blocks": [b for _, bl, _ in cur for b in bl]})
            cur.clear()

    for pg in pages:
        if cur and (len(cur) >= config.PDF_CHUNK_PAGES or sum(1 for p in cur if p[2]) + pg[2] > IMAGES_PER_CHUNK):
            flush()
        cur.append(pg)
    flush()
    return chunks or [{"label": title, "blocks": [{"type": "text", "text": "(empty PDF)"}]}]


def pdf_bytes_to_text(data: bytes) -> str:
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(data))
    return "\n".join(f"=== page {i + 1} ===\n{p.extract_text() or ''}" for i, p in enumerate(reader.pages))
