import mimetypes
import os

import httpx
from abc import ABC, abstractmethod


OCR_SPACE_ENDPOINT = "https://api.ocr.space/parse/image"
OCR_SPACE_DEMO_KEY = "helloworld"


def _extract_text_local(path: str) -> str:
    ext = os.path.splitext(path)[1].lower()
    if ext == ".pdf":
        from pypdf import PdfReader
        return "\n".join((p.extract_text() or "") for p in PdfReader(path).pages)
    if ext in (".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"):
        import pytesseract
        from PIL import Image
        return pytesseract.image_to_string(Image.open(path))
    with open(path, "r", errors="ignore") as f:
        return f.read()


async def extract_text(path: str, settings) -> str:
    ext = os.path.splitext(path)[1].lower()
    if ext not in (".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"):
        import asyncio
        return await asyncio.to_thread(_extract_text_local, path)
    if settings.ocr_provider == "tesseract":
        import asyncio
        return await asyncio.to_thread(_extract_text_local, path)

    content_type = mimetypes.guess_type(path)[0] or "application/octet-stream"
    with open(path, "rb") as image_file:
        image_bytes = image_file.read()
    async with httpx.AsyncClient(timeout=90) as client:
        response = await client.post(
            OCR_SPACE_ENDPOINT,
            data={"language": "eng", "OCREngine": "2"},
            files={"file": (os.path.basename(path), image_bytes, content_type)},
            headers={
                "apikey": settings.ocr_api_key or OCR_SPACE_DEMO_KEY,
            },
        )
    response.raise_for_status()
    result = response.json()
    if result.get("IsErroredOnProcessing"):
        error = result.get("ErrorMessage") or "The online OCR service rejected the image."
        if isinstance(error, list):
            error = " ".join(str(message) for message in error)
        raise RuntimeError(str(error))
    parsed = result.get("ParsedResults") or []
    return "\n".join(item.get("ParsedText", "") for item in parsed).strip()


class AIProvider(ABC):
    def __init__(self, s): self.s = s
    @abstractmethod
    async def chat(self, system: str, msgs: list) -> str: ...

class Ollama(AIProvider):
    async def chat(self, system, msgs):
        async with httpx.AsyncClient(timeout=300) as c:
            r = await c.post(f"{self.s.ollama_url.rstrip('/')}/api/chat", json={
                "model": self.s.model_name, "stream": False,
                "messages": [{"role": "system", "content": system}] + msgs})
            r.raise_for_status()
            return r.json()["message"]["content"]

class OpenAI(AIProvider):
    async def chat(self, system, msgs):
        async with httpx.AsyncClient(timeout=300) as c:
            r = await c.post("https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {self.s.cloud_api_key}"},
                json={"model": self.s.model_name,
                      "messages": [{"role": "system", "content": system}] + msgs})
            r.raise_for_status()
            return r.json()["choices"][0]["message"]["content"]

class Gemini(AIProvider):
    async def chat(self, system, msgs):
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.s.model_name}:generateContent"
        body = {"systemInstruction": {"parts": [{"text": system}]},
                "contents": [{"role": "user" if m["role"] == "user" else "model",
                              "parts": [{"text": m["content"]}]} for m in msgs]}
        async with httpx.AsyncClient(timeout=300) as c:
            r = await c.post(url, headers={"x-goog-api-key": self.s.cloud_api_key}, json=body)
            r.raise_for_status()
            return r.json()["candidates"][0]["content"]["parts"][0]["text"]

PROVIDERS = {"ollama": Ollama, "openai": OpenAI, "gemini": Gemini}

async def generate(settings, system, msgs):
    return await PROVIDERS.get(settings.provider, Ollama)(settings).chat(system, msgs)

async def list_models(provider: str, api_key: str | None, ollama_url: str) -> list[str]:
    async with httpx.AsyncClient(timeout=30) as c:
        if provider == "ollama":
            r = await c.get(f"{ollama_url.rstrip('/')}/api/tags")
            r.raise_for_status()
            return sorted(model["name"] for model in r.json().get("models", []))
        if provider == "gemini":
            if not api_key:
                raise ValueError("Enter an API key to load Gemini models.")
            r = await c.get("https://generativelanguage.googleapis.com/v1beta/models",
                            headers={"x-goog-api-key": api_key})
            r.raise_for_status()
            return sorted(
                model["name"].removeprefix("models/")
                for model in r.json().get("models", [])
                if "generateContent" in model.get("supportedGenerationMethods", [])
            )
        if provider == "openai":
            if not api_key:
                raise ValueError("Enter an API key to load OpenAI models.")
            r = await c.get("https://api.openai.com/v1/models",
                            headers={"Authorization": f"Bearer {api_key}"})
            r.raise_for_status()
            prefixes = ("gpt-", "o1", "o3", "o4", "chatgpt-")
            return sorted(model["id"] for model in r.json().get("data", [])
                          if model.get("id", "").startswith(prefixes))
    raise ValueError("Unsupported AI provider.")
