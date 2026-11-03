import mimetypes
import os

import httpx
from abc import ABC, abstractmethod


OCR_SPACE_ENDPOINT = "https://api.ocr.space/parse/image"
OCR_SPACE_DEMO_KEY = "helloworld"

_paddle_ocr_engine = None


def get_paddle_ocr():
    global _paddle_ocr_engine
    if _paddle_ocr_engine is None:
        from paddleocr import PaddleOCR
        # Initialize PaddleOCR with English language and orientation classification
        _paddle_ocr_engine = PaddleOCR(use_angle_cls=True, lang="en")
    return _paddle_ocr_engine


def _extract_paddleocr(path: str) -> str:
    engine = get_paddle_ocr()
    result = engine.ocr(path, cls=True)
    if not result:
        return ""
    lines = []
    for block in result:
        if not block:
            continue
        for line in block:
            if line and len(line) >= 2 and line[1]:
                text = line[1][0]
                if text:
                    lines.append(str(text))
    return "\n".join(lines).strip()


def _optimize_image_size(path: str, max_dim: int = 1400):
    """Ensure images are resized to efficient processing dimensions for OCR engines."""
    from PIL import Image
    try:
        with Image.open(path) as img:
            w, h = img.size
            if max(w, h) > max_dim:
                scale = max_dim / float(max(w, h))
                new_size = (int(w * scale), int(h * scale))
                resized = img.resize(new_size, Image.Resampling.LANCZOS)
                resized.save(path)
    except Exception:
        pass


def _extract_text_local(path: str, provider: str = "paddleocr") -> str:
    ext = os.path.splitext(path)[1].lower()
    if ext == ".pdf":
        from pypdf import PdfReader
        return "\n".join((p.extract_text() or "") for p in PdfReader(path).pages)
    if ext in (".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"):
        _optimize_image_size(path)
        if provider == "paddleocr":
            try:
                return _extract_paddleocr(path)
            except Exception as ocr_err:
                print(f"[PaddleOCR fallback]: {ocr_err}")
                try:
                    import pytesseract
                    from PIL import Image
                    return pytesseract.image_to_string(Image.open(path))
                except Exception:
                    return ""
        elif provider == "tesseract":
            import pytesseract
            from PIL import Image
            return pytesseract.image_to_string(Image.open(path))
    with open(path, "r", errors="ignore") as f:
        return f.read()


async def extract_text(path: str, settings) -> str:
    ext = os.path.splitext(path)[1].lower()
    provider = getattr(settings, "ocr_provider", "paddleocr") or "paddleocr"

    if ext not in (".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"):
        import asyncio
        return await asyncio.to_thread(_extract_text_local, path, provider)

    if provider in ("paddleocr", "tesseract"):
        import asyncio
        return await asyncio.to_thread(_extract_text_local, path, provider)

    # Fallback to online OCR if explicitly configured
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
    def __init__(self, s):
        self.s = s

    @abstractmethod
    async def chat(self, system: str, msgs: list) -> str:
        ...


class Ollama(AIProvider):
    async def chat(self, system, msgs):
        endpoint = (self.s.ollama_url or "http://localhost:11434").rstrip("/")
        async with httpx.AsyncClient(timeout=300) as c:
            try:
                r = await c.post(
                    f"{endpoint}/api/chat",
                    json={
                        "model": self.s.model_name,
                        "stream": False,
                        "messages": [{"role": "system", "content": system}] + msgs,
                    },
                )
                r.raise_for_status()
                return r.json()["message"]["content"]
            except httpx.ConnectError:
                raise RuntimeError(
                    f"Could not connect to Ollama at {endpoint}. Ensure Ollama is running (`ollama serve`)."
                )
            except httpx.HTTPStatusError as e:
                raise RuntimeError(f"Ollama error ({e.response.status_code}): {e.response.text}") from e


class OpenAI(AIProvider):
    async def chat(self, system, msgs):
        async with httpx.AsyncClient(timeout=300) as c:
            try:
                r = await c.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={"Authorization": f"Bearer {self.s.cloud_api_key}"},
                    json={
                        "model": self.s.model_name,
                        "messages": [{"role": "system", "content": system}] + msgs,
                    },
                )
                r.raise_for_status()
                return r.json()["choices"][0]["message"]["content"]
            except httpx.HTTPStatusError as e:
                err_detail = "OpenAI API error"
                try:
                    err_detail = e.response.json().get("error", {}).get("message") or err_detail
                except Exception:
                    pass
                raise RuntimeError(f"OpenAI error ({e.response.status_code}): {err_detail}") from e


class Gemini(AIProvider):
    async def chat(self, system, msgs):
        if not self.s.cloud_api_key:
            raise RuntimeError(
                "No Gemini API key configured. Either select 'Free Tier' in Settings (if server GEMINI_API_KEY is set) or enter your own Google AI Studio API key."
            )
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.s.model_name}:generateContent"
        body = {
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": [
                {
                    "role": "user" if m["role"] == "user" else "model",
                    "parts": [{"text": m["content"]}],
                }
                for m in msgs
            ],
        }
        async with httpx.AsyncClient(timeout=300) as c:
            try:
                r = await c.post(
                    url,
                    headers={"x-goog-api-key": self.s.cloud_api_key},
                    json=body,
                )
                r.raise_for_status()
                data = r.json()
                candidates = data.get("candidates", [])
                if not candidates or "content" not in candidates[0]:
                    raise RuntimeError("Gemini returned an empty response. The response may have been filtered.")
                return candidates[0]["content"]["parts"][0]["text"]
            except httpx.HTTPStatusError as e:
                err_detail = "Google AI Studio error"
                try:
                    err_detail = e.response.json().get("error", {}).get("message") or err_detail
                except Exception:
                    pass
                raise RuntimeError(f"Google Gemini error ({e.response.status_code}): {err_detail}") from e


PROVIDERS = {"ollama": Ollama, "openai": OpenAI, "gemini": Gemini}


async def generate(settings, system, msgs):
    return await PROVIDERS.get(settings.provider, Ollama)(settings).chat(system, msgs)


# Standard curated models with user-friendly descriptions and badges
CURATED_MODELS = {
    "gemini": [
        {
            "id": "gemini-2.0-flash",
            "name": "Gemini 2.0 Flash",
            "badge": "Recommended • Free Tier Friendly",
            "description": "Fast multimodal model with high rate limits and generous free quota on Google AI Studio.",
            "is_recommended": True,
        },
        {
            "id": "gemini-2.0-flash-lite",
            "name": "Gemini 2.0 Flash-Lite",
            "badge": "Ultra Fast",
            "description": "Lightweight, fastest response times, ideal for quick queries.",
            "is_recommended": False,
        },
        {
            "id": "gemini-1.5-flash",
            "name": "Gemini 1.5 Flash",
            "badge": "Stable Workhorse",
            "description": "Reliable 1M token context window for large documents and notes.",
            "is_recommended": False,
        },
        {
            "id": "gemini-1.5-pro",
            "name": "Gemini 1.5 Pro",
            "badge": "Deep Reasoning",
            "description": "Maximum reasoning capability for complex logic and extensive references.",
            "is_recommended": False,
        },
    ],
    "openai": [
        {
            "id": "gpt-4o-mini",
            "name": "GPT-4o Mini",
            "badge": "Recommended • Fast & Low Cost",
            "description": "Smart, fast, and cost-efficient multimodal model.",
            "is_recommended": True,
        },
        {
            "id": "gpt-4o",
            "name": "GPT-4o",
            "badge": "Flagship Omni",
            "description": "OpenAI's high-intelligence flagship model.",
            "is_recommended": False,
        },
        {
            "id": "o3-mini",
            "name": "o3-mini",
            "badge": "Advanced Reasoning",
            "description": "Specialized in STEM, math, and complex logical problem-solving.",
            "is_recommended": False,
        },
        {
            "id": "o1-mini",
            "name": "o1-mini",
            "badge": "Reasoning",
            "description": "Fast reasoning model for math and coding.",
            "is_recommended": False,
        },
        {
            "id": "gpt-3.5-turbo",
            "name": "GPT-3.5 Turbo",
            "badge": "Legacy Fast",
            "description": "Standard fast conversational model.",
            "is_recommended": False,
        },
    ],
    "ollama": [
        {
            "id": "llama3",
            "name": "Llama 3",
            "badge": "Recommended Local",
            "description": "Popular open-source model running privately on your computer.",
            "is_recommended": True,
        },
        {
            "id": "mistral",
            "name": "Mistral",
            "badge": "Local Fast",
            "description": "Fast and lightweight open model.",
            "is_recommended": False,
        },
        {
            "id": "deepseek-r1:8b",
            "name": "DeepSeek R1 (8B)",
            "badge": "Reasoning Local",
            "description": "Open-weights reasoning model running locally on Ollama.",
            "is_recommended": False,
        },
    ],
}


async def list_models(provider: str, api_key: str | None, ollama_url: str):
    """
    Dynamically discovers and filters active models for the user's provider and API key.
    - Excludes phased out and deprecated models (e.g. Gemini 1.0, gemini-pro, older snapshots).
    - Excludes non-conversational models (e.g. embeddings, audio, tts, aqa, dall-e).
    - Strictly checks supportedGenerationMethods for Gemini.
    - Annotates models with user-friendly badges and descriptions.
    """
    clean_key = (api_key or "").strip()

    async with httpx.AsyncClient(timeout=30) as c:
        if provider == "ollama":
            endpoint = (ollama_url or "http://localhost:11434").rstrip("/")
            try:
                r = await c.get(f"{endpoint}/api/tags", timeout=5)
                r.raise_for_status()
                models_list = []
                for m in r.json().get("models", []):
                    m_name = m.get("name", "")
                    size_gb = round(m.get("size", 0) / (1024**3), 1)
                    size_str = f"{size_gb}GB" if size_gb > 0 else ""
                    models_list.append({
                        "id": m_name,
                        "name": m_name,
                        "badge": f"Local {size_str}".strip(),
                        "description": f"Installed model ({size_str}) running locally on your device.",
                        "is_recommended": "llama3" in m_name,
                    })
                return {
                    "models": models_list if models_list else CURATED_MODELS["ollama"],
                    "verified": True,
                    "message": f"Connected to Ollama! Found {len(models_list)} locally installed models.",
                }
            except Exception:
                return {
                    "models": CURATED_MODELS["ollama"],
                    "verified": False,
                    "message": f"Could not reach Ollama at {endpoint}. Start Ollama (`ollama serve`) to see your installed models.",
                }

        if provider == "gemini":
            if not clean_key:
                return {
                    "models": CURATED_MODELS["gemini"],
                    "verified": False,
                    "message": "Showing recommended models. Enter your Google AI Studio API key and click 'Check Models' to test your access.",
                }

            url = f"https://generativelanguage.googleapis.com/v1beta/models?key={clean_key}"
            try:
                r = await c.get(url)
                r.raise_for_status()
            except httpx.HTTPStatusError as e:
                err_text = "API key verification failed."
                try:
                    err_json = e.response.json().get("error", {})
                    err_text = err_json.get("message") or err_text
                except Exception:
                    pass
                raise ValueError(f"Google AI Studio: {err_text}") from e
            except Exception as e:
                raise ValueError(f"Could not connect to Google AI Studio: {e}") from e

            raw_models = r.json().get("models", [])
            valid_models = []
            curated_map = {m["id"]: m for m in CURATED_MODELS["gemini"]}

            for item in raw_models:
                methods = item.get("supportedGenerationMethods", [])
                # Must support generateContent (filters out embedding, aqa, imagen)
                if "generateContent" not in methods:
                    continue

                raw_name = item.get("name", "").replace("models/", "")
                lower = raw_name.lower()

                # Filter out phased out models
                # Gemini 1.0 Pro, Gemini Pro (1.0), Gemini Pro Vision are phased out
                if (
                    "gemini-1.0" in lower
                    or lower == "gemini-pro"
                    or "gemini-pro-vision" in lower
                    or any(k in lower for k in ["embedding", "aqa", "learnlm", "imagen", "tts", "realtime"])
                ):
                    continue

                if raw_name in curated_map:
                    valid_models.append(curated_map[raw_name])
                else:
                    display_name = item.get("displayName") or raw_name
                    desc = (item.get("description") or "").strip()
                    badge = "Active"
                    if "2.0-flash" in lower or "2.5-flash" in lower:
                        badge = "Fast • Multimodal"
                    elif "pro" in lower:
                        badge = "Reasoning"
                    elif "thinking" in lower:
                        badge = "Thinking Model"

                    valid_models.append({
                        "id": raw_name,
                        "name": display_name,
                        "badge": badge,
                        "description": desc[:120] if desc else "Available Google Gemini model.",
                        "is_recommended": "2.0-flash" in lower,
                    })

            # Sort prioritized models first
            priority_order = [
                "gemini-2.0-flash",
                "gemini-2.0-flash-lite",
                "gemini-1.5-flash",
                "gemini-1.5-flash-8b",
                "gemini-1.5-pro",
            ]

            def gemini_rank(m):
                mid = m["id"]
                if mid in priority_order:
                    return (0, priority_order.index(mid))
                if "2.5" in mid or "3.0" in mid:
                    return (1, mid)
                return (2, mid)

            sorted_models = sorted(valid_models, key=gemini_rank)
            return {
                "models": sorted_models if sorted_models else CURATED_MODELS["gemini"],
                "verified": True,
                "message": f"Verified with Google AI Studio! Found {len(sorted_models)} active models for your API key.",
            }

        if provider == "openai":
            if not clean_key:
                return {
                    "models": CURATED_MODELS["openai"],
                    "verified": False,
                    "message": "Showing recommended models. Enter your OpenAI API key and click 'Check Models' to test your access.",
                }

            try:
                r = await c.get(
                    "https://api.openai.com/v1/models",
                    headers={"Authorization": f"Bearer {clean_key}"},
                )
                r.raise_for_status()
            except httpx.HTTPStatusError as e:
                err_text = "API key verification failed."
                try:
                    err_json = e.response.json().get("error", {})
                    err_text = err_json.get("message") or err_text
                except Exception:
                    pass
                raise ValueError(f"OpenAI: {err_text}") from e
            except Exception as e:
                raise ValueError(f"Could not connect to OpenAI: {e}") from e

            raw_data = r.json().get("data", [])
            valid_models = []
            curated_map = {m["id"]: m for m in CURATED_MODELS["openai"]}

            excluded_keywords = [
                "embedding", "dall-e", "whisper", "tts", "realtime", "audio",
                "moderation", "babbage", "davinci", "instruct", "search", "similarity"
            ]

            for item in raw_data:
                mid = item.get("id", "")
                lower = mid.lower()

                if not any(prefix in lower for prefix in ["gpt-", "o1", "o3"]):
                    continue

                if any(k in lower for k in excluded_keywords):
                    continue

                # Filter out old dated snapshots
                if any(d in lower for d in ["-0613", "-0301", "-0125", "-1106", "-2024-", "-2023-"]):
                    continue

                if mid in curated_map:
                    valid_models.append(curated_map[mid])
                else:
                    badge = "Reasoning" if ("o1" in lower or "o3" in lower) else "Chat Model"
                    valid_models.append({
                        "id": mid,
                        "name": mid,
                        "badge": badge,
                        "description": "Available chat model on your OpenAI account.",
                        "is_recommended": "4o-mini" in lower,
                    })

            priority_order = ["gpt-4o-mini", "gpt-4o", "o3-mini", "o1-mini", "gpt-3.5-turbo"]

            def openai_rank(m):
                mid = m["id"]
                if mid in priority_order:
                    return (0, priority_order.index(mid))
                return (1, mid)

            sorted_models = sorted(valid_models, key=openai_rank)
            return {
                "models": sorted_models if sorted_models else CURATED_MODELS["openai"],
                "verified": True,
                "message": f"Verified with OpenAI! Found {len(sorted_models)} active models for your API key.",
            }

    return {"models": [], "verified": False, "message": "Unknown provider"}
