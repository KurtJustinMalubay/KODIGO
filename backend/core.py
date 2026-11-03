import os
import shutil
import uuid

from sqlalchemy.orm import Session

from models import Setting, UniversalReference, Reference

UPLOADS = "uploads"
os.makedirs(UPLOADS, exist_ok=True)


def serialize(record, exclude=("extracted_text",)):
    if record is None:
        return None
    data = {}
    for column in record.__table__.columns:
        if column.name in exclude:
            continue
        val = getattr(record, column.name)
        if hasattr(val, "isoformat"):
            val = val.isoformat()
        data[column.name] = val
    return data


def get_settings(db: Session) -> Setting:
    settings = db.get(Setting, 1)
    if settings is None:
        settings = Setting(id=1)
        db.add(settings)
        db.commit()
    return settings


class RequestSettings:
    """Per-request settings object populated from device headers with database fallbacks."""
    def __init__(self, provider, model_name, cloud_api_key, ollama_url, ocr_provider):
        self.provider = provider
        self.model_name = model_name
        self.cloud_api_key = cloud_api_key
        self.ollama_url = ollama_url
        self.ocr_provider = ocr_provider


def resolve_effective_settings(db: Session, request=None) -> RequestSettings:
    """Resolves settings isolated per client device from request headers."""
    db_settings = get_settings(db)
    provider = db_settings.provider or "gemini"
    model_name = db_settings.model_name or "gemini-3.5-flash-lite"
    cloud_api_key = db_settings.cloud_api_key
    ollama_url = db_settings.ollama_url or "http://localhost:11434"
    ocr_provider = db_settings.ocr_provider or "paddleocr"

    if request is not None and hasattr(request, "headers"):
        headers = request.headers
        client_provider = headers.get("x-ai-provider")
        client_model = headers.get("x-model-name")
        client_key = headers.get("x-cloud-api-key")
        client_ollama = headers.get("x-ollama-url")
        client_ocr = headers.get("x-ocr-provider")

        if client_provider:
            provider = client_provider
        if client_model:
            model_name = client_model
        if client_key:
            cloud_api_key = client_key
        if client_ollama:
            ollama_url = client_ollama
        if client_ocr:
            ocr_provider = client_ocr

    # Optional server-level environment variable fallbacks
    if not cloud_api_key:
        if provider == "openai":
            cloud_api_key = os.environ.get("OPENAI_API_KEY")
        elif provider == "gemini":
            cloud_api_key = os.environ.get("GEMINI_API_KEY")

    return RequestSettings(
        provider=provider,
        model_name=model_name,
        cloud_api_key=cloud_api_key,
        ollama_url=ollama_url,
        ocr_provider=ocr_provider,
    )


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
