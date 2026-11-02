import os
import shutil
import uuid

from sqlalchemy.orm import Session

from models import Setting, UniversalReference, Reference

UPLOADS = "uploads"
os.makedirs(UPLOADS, exist_ok=True)


def serialize(record, exclude=("extracted_text",)):
    return {
        column.name: getattr(record, column.name)
        for column in record.__table__.columns
        if column.name not in exclude
    }


def get_settings(db: Session) -> Setting:
    settings = db.get(Setting, 1)
    if settings is None:
        settings = Setting(id=1)
        db.add(settings)
        db.commit()
    return settings


def save_upload(upload) -> str:
    path = os.path.join(
        UPLOADS, uuid.uuid4().hex + os.path.splitext(upload.filename or "")[1]
    )
    with open(path, "wb") as output:
        shutil.copyfileobj(upload.file, output)
    return path


def build_context(db: Session, chat_id: int) -> str:
    universal = db.query(UniversalReference).filter_by(is_active=True).all()
    chat_references = (
        db.query(Reference).filter_by(chat_id=chat_id, is_active=True).all()
    )
    corpus = "\n\n".join(
        f"[{reference.filename}]\n{reference.extracted_text}"
        for reference in [*universal, *chat_references]
    )
    return corpus[:12000]
