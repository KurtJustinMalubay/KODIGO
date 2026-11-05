import os
from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.orm import Session

from core import get_settings, serialize
from models import get_db
from services import list_models

router = APIRouter()
AI_PROVIDERS = {"ollama", "openai", "gemini"}
OCR_PROVIDERS = {"paddleocr", "tesseract", "online"}


def public_settings(settings):
    result = serialize(
        settings, exclude=("cloud_api_key", "ocr_api_key")
    )
    result["has_key"] = bool(settings.cloud_api_key)
    result["has_ocr_key"] = bool(settings.ocr_api_key)
    result["server_has_gemini_key"] = bool(os.environ.get("GEMINI_API_KEY"))
    result["server_has_openai_key"] = bool(os.environ.get("OPENAI_API_KEY"))
    return result


@router.get("/api/settings")
def read_settings(db: Session = Depends(get_db)):
    return public_settings(get_settings(db))


@router.put("/api/settings")
def write_settings(body: dict = Body(...), db: Session = Depends(get_db)):
    settings = get_settings(db)
    provider = body.get("provider", settings.provider)
    ocr_provider = body.get("ocr_provider", settings.ocr_provider)
    if provider not in AI_PROVIDERS:
        raise HTTPException(400, "Unsupported AI provider.")
    if ocr_provider not in OCR_PROVIDERS:
        raise HTTPException(400, "Unsupported OCR provider.")
    for field in ("provider", "model_name", "ollama_url", "default_mode"):
        if field in body:
            setattr(settings, field, body[field])
    settings.ocr_provider = ocr_provider
    if "setup_complete" in body:
        settings.setup_complete = bool(body["setup_complete"])
    if body.get("cloud_api_key"):
        settings.cloud_api_key = body["cloud_api_key"]
    if body.get("ocr_api_key"):
        settings.ocr_api_key = body["ocr_api_key"]
    db.commit()
    return public_settings(settings)


@router.post("/api/models")
async def available_models(body: dict = Body(...), db: Session = Depends(get_db)):
    settings = get_settings(db)
    provider = body.get("provider", settings.provider)
    if provider not in AI_PROVIDERS:
        raise HTTPException(400, "Unsupported AI provider.")
    try:
        api_key = (body.get("cloud_api_key") or settings.cloud_api_key or "").strip()
        is_using_server_fallback = False
        if not api_key:
            if provider == "gemini" and os.environ.get("GEMINI_API_KEY"):
                api_key = os.environ.get("GEMINI_API_KEY").strip()
                is_using_server_fallback = True
            elif provider == "openai" and os.environ.get("OPENAI_API_KEY"):
                api_key = os.environ.get("OPENAI_API_KEY").strip()
                is_using_server_fallback = True

        result = await list_models(
            provider,
            api_key,
            body.get("ollama_url") or settings.ollama_url,
        )
        if isinstance(result, dict):
            if is_using_server_fallback:
                result["is_server_key"] = True
                result["message"] = (
                    "✓ Free Tier active! Using built-in server Gemini key."
                    if result.get("verified")
                    else result.get("message")
                )
            return result
        return {"models": result, "verified": True, "message": ""}
    except ValueError as error:
        raise HTTPException(400, str(error)) from error
    except Exception as error:
        raise HTTPException(
            502, f"Could not load models: {str(error)}"
        ) from error
