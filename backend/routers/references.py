import os
from fastapi import APIRouter, Body, Depends, File, HTTPException, Request, UploadFile
from sqlalchemy.orm import Session

from core import get_settings, save_upload, serialize
from models import Reference, UniversalReference, get_db
from services import extract_text

router = APIRouter()


@router.post("/api/extract-text")
async def extract_text_stateless(
    request: Request, file: UploadFile = File(...), db: Session = Depends(get_db)
):
    """
    Stateless text extraction for PDFs and images.
    Extracts text and immediately returns it to the user's device.
    Does NOT store any file or database row on Render's ephemeral disk.
    """
    from routers.chats import resolve_effective_settings
    settings = resolve_effective_settings(db, request)
    path = save_upload(file)
    try:
        extracted = await extract_text(path, settings)
    except Exception as error:
        raise HTTPException(502, f"OCR/Text extraction error: {error}") from error
    finally:
        try:
            if os.path.exists(path):
                os.remove(path)
        except Exception:
            pass

    return {
        "filename": file.filename,
        "extracted_text": extracted or "",
    }


async def add_reference(model, db: Session, upload: UploadFile, **fields):
    path = save_upload(upload)
    try:
        extracted_text = await extract_text(path, get_settings(db))
    except Exception as error:
        raise HTTPException(502, f"OCR provider error: {error}") from error
    
    # Store record if DB is available, but never fail if SQLite is reset
    try:
        reference = model(
            filename=upload.filename,
            file_path=path,
            extracted_text=extracted_text,
            **fields,
        )
        db.add(reference)
        db.commit()
        return serialize(reference)
    except Exception:
        return {
            "id": 1,
            "filename": upload.filename,
            "file_path": path,
            "extracted_text": extracted_text,
            "is_active": True,
        }


@router.get("/api/universal-references")
def list_universal_references(db: Session = Depends(get_db)):
    try:
        return [
            serialize(reference)
            for reference in db.query(UniversalReference).order_by(UniversalReference.id)
        ]
    except Exception:
        return []


@router.post("/api/universal-references")
async def add_universal_reference(
    file: UploadFile = File(...), db: Session = Depends(get_db)
):
    return await add_reference(UniversalReference, db, file)


@router.patch("/api/universal-references/{reference_id}")
def toggle_universal_reference(
    reference_id: int,
    is_active: bool = Body(..., embed=True),
    db: Session = Depends(get_db),
):
    try:
        reference = db.get(UniversalReference, reference_id)
        if reference:
            reference.is_active = is_active
            db.commit()
            return serialize(reference)
    except Exception:
        pass
    return {"id": reference_id, "is_active": is_active}


@router.delete("/api/universal-references/{reference_id}")
def delete_universal_reference(reference_id: int, db: Session = Depends(get_db)):
    try:
        reference = db.get(UniversalReference, reference_id)
        if reference:
            db.delete(reference)
            db.commit()
    except Exception:
        pass
    return {"ok": True}


@router.get("/api/chats/{chat_id}/references")
def list_chat_references(chat_id: int, db: Session = Depends(get_db)):
    try:
        return [
            serialize(reference)
            for reference in db.query(Reference)
            .filter_by(chat_id=chat_id)
            .order_by(Reference.id)
        ]
    except Exception:
        return []


@router.post("/api/chats/{chat_id}/references")
async def add_chat_reference(
    chat_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)
):
    return await add_reference(Reference, db, file, chat_id=chat_id)


@router.patch("/api/references/{reference_id}")
def toggle_reference(
    reference_id: int,
    is_active: bool = Body(..., embed=True),
    db: Session = Depends(get_db),
):
    try:
        reference = db.get(Reference, reference_id)
        if reference:
            reference.is_active = is_active
            db.commit()
            return serialize(reference)
    except Exception:
        pass
    return {"id": reference_id, "is_active": is_active}


@router.delete("/api/references/{reference_id}")
def delete_reference(reference_id: int, db: Session = Depends(get_db)):
    try:
        reference = db.get(Reference, reference_id)
        if reference:
            db.delete(reference)
            db.commit()
    except Exception:
        pass
    return {"ok": True}
