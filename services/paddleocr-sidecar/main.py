"""PaddleOCR sidecar — receipt text extraction for claims (CPU)."""
from __future__ import annotations

import os
import tempfile
from typing import Any

from fastapi import FastAPI, File, UploadFile, HTTPException
from paddleocr import PaddleOCR

app = FastAPI(title="AuditIQ PaddleOCR", version="1.0.0")
_ocr: PaddleOCR | None = None


def get_ocr() -> PaddleOCR:
    global _ocr
    if _ocr is None:
        # ponytail: English-only CPU model; add lang='en' + 'hi' if mixed receipts need it
        _ocr = PaddleOCR(use_angle_cls=True, lang="en", use_gpu=False, show_log=False)
    return _ocr


def lines_from_result(result: Any) -> list[str]:
    lines: list[str] = []
    if not result:
        return lines
    pages = result if isinstance(result, list) else [result]
    for page in pages:
        if not page:
            continue
        for item in page:
            if not item or len(item) < 2:
                continue
            text_part = item[1]
            if isinstance(text_part, (list, tuple)) and text_part:
                lines.append(str(text_part[0]))
            elif isinstance(text_part, str):
                lines.append(text_part)
    return lines


@app.get("/health")
def health() -> dict[str, bool]:
    return {"ok": True}


@app.post("/extract")
async def extract(file: UploadFile = File(...)) -> dict[str, str]:
    if not file.filename:
        raise HTTPException(status_code=400, detail="filename required")
    suffix = os.path.splitext(file.filename)[1] or ".jpg"
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="empty file")

    path: str | None = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(data)
            path = tmp.name
        result = get_ocr().ocr(path, cls=True)
        text = "\n".join(lines_from_result(result))
        return {"text": text}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    finally:
        if path and os.path.exists(path):
            os.unlink(path)
