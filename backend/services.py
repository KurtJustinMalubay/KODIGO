import base64
import json
import mimetypes
import os
from abc import ABC, abstractmethod

import httpx

OCR_SPACE_ENDPOINT = "https://api.ocr.space/parse/image"
OCR_SPACE_DEMO_KEY = "helloworld"

# Shared persistent HTTP client with connection pooling and HTTP/2 for ultra-low latency
_shared_client = None


def get_http_client() -> httpx.AsyncClient:
    global _shared_client
    if _shared_client is None or _shared_client.is_closed:
        limits = httpx.Limits(max_keepalive_connections=30, max_connections=60, keepalive_expiry=60.0)
        timeout = httpx.Timeout(180.0, connect=10.0)
        try:
            _shared_client = httpx.AsyncClient(timeout=timeout, limits=limits, http2=True)
        except Exception:
            _shared_client = httpx.AsyncClient(timeout=timeout, limits=limits)
    return _shared_client


_paddle_ocr_engine = None


def get_paddle_ocr():
    global _paddle_ocr_engine
    if _paddle_ocr_engine is None:
        try:
            from paddleocr import PaddleOCR
            _paddle_ocr_engine = PaddleOCR(use_angle_cls=True, lang="en")
        except Exception as e:
            print(f"[PaddleOCR load notice]: {e}")
            _paddle_ocr_engine = False
    return _paddle_ocr_engine if _paddle_ocr_engine is not False else None


def _extract_paddleocr(path: str) -> str:
    engine = get_paddle_ocr()
    if not engine:
        return ""
    try:
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
    except Exception as e:
        print(f"[PaddleOCR extraction fallback]: {e}")
        return ""


def _optimize_image_size(path: str, max_dim: int = 1400):
    """Ensure images are resized to efficient processing dimensions."""
    try:
        from PIL import Image
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
        try:
            from pypdf import PdfReader
            return "\n".join((p.extract_text() or "") for p in PdfReader(path).pages)
        except Exception:
            return ""
    if ext in (".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"):
        _optimize_image_size(path)
        if provider == "paddleocr":
            text = _extract_paddleocr(path)
            if text:
                return text
            try:
                import pytesseract
                from PIL import Image
                return pytesseract.image_to_string(Image.open(path))
            except Exception:
                return ""
        elif provider == "tesseract":
            try:
                import pytesseract
                from PIL import Image
                return pytesseract.image_to_string(Image.open(path))
            except Exception:
                return ""
    try:
        with open(path, "r", errors="ignore") as f:
            return f.read()
    except Exception:
        return ""


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
    client = get_http_client()
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
    async def chat(self, system: str, msgs: list, image_bytes: bytes | None = None, image_mime: str | None = None) -> str:
        ...

    @abstractmethod
    async def stream(self, system: str, msgs: list, image_bytes: bytes | None = None, image_mime: str | None = None):
        ...


class Ollama(AIProvider):
    def _build_messages(self, system: str, msgs: list, image_bytes: bytes | None = None):
        formatted = [{"role": "system", "content": system}]
        for i, m in enumerate(msgs):
            role = m.get("role", "user")
            content = m.get("content", "")
            msg_obj = {"role": role, "content": content}
            if i == len(msgs) - 1 and role == "user" and image_bytes:
                b64 = base64.b64encode(image_bytes).decode("utf-8")
                msg_obj["images"] = [b64]
            formatted.append(msg_obj)
        return formatted

    async def chat(self, system, msgs, image_bytes=None, image_mime=None):
        endpoint = (self.s.ollama_url or "http://localhost:11434").rstrip("/")
        client = get_http_client()
        try:
            r = await client.post(
                f"{endpoint}/api/chat",
                json={
                    "model": self.s.model_name,
                    "stream": False,
                    "messages": self._build_messages(system, msgs, image_bytes),
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

    async def stream(self, system, msgs, image_bytes=None, image_mime=None):
        endpoint = (self.s.ollama_url or "http://localhost:11434").rstrip("/")
        client = get_http_client()
        try:
            async with client.stream(
                "POST",
                f"{endpoint}/api/chat",
                json={
                    "model": self.s.model_name,
                    "stream": True,
                    "messages": self._build_messages(system, msgs, image_bytes),
                },
                timeout=180.0,
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line:
                        continue
                    try:
                        payload = json.loads(line)
                        content = payload.get("message", {}).get("content", "")
                        if content:
                            yield content
                    except Exception:
                        continue
        except httpx.ConnectError:
            raise RuntimeError(f"Could not connect to Ollama at {endpoint}.")
        except httpx.HTTPStatusError as e:
            raise RuntimeError(f"Ollama streaming error ({e.response.status_code}): {e.response.text}") from e


class OpenAI(AIProvider):
    def _build_messages(self, system: str, msgs: list, image_bytes: bytes | None = None, image_mime: str | None = None):
        messages = [{"role": "system", "content": system}]
        for i, m in enumerate(msgs):
            role = m.get("role", "user")
            content = m.get("content", "")
            if i == len(msgs) - 1 and role == "user" and image_bytes:
                b64 = base64.b64encode(image_bytes).decode("utf-8")
                mime = image_mime or "image/jpeg"
                parts = []
                if content:
                    parts.append({"type": "text", "text": content})
                else:
                    parts.append({"type": "text", "text": "Please solve this question step by step."})
                parts.append({
                    "type": "image_url",
                    "image_url": {"url": f"data:{mime};base64,{b64}", "detail": "auto"},
                })
                messages.append({"role": role, "content": parts})
            else:
                messages.append({"role": role, "content": content})
        return messages

    async def chat(self, system, msgs, image_bytes=None, image_mime=None):
        client = get_http_client()
        try:
            r = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {self.s.cloud_api_key}"},
                json={
                    "model": self.s.model_name,
                    "temperature": 0.4,
                    "messages": self._build_messages(system, msgs, image_bytes, image_mime),
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

    async def stream(self, system, msgs, image_bytes=None, image_mime=None):
        client = get_http_client()
        try:
            async with client.stream(
                "POST",
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {self.s.cloud_api_key}"},
                json={
                    "model": self.s.model_name,
                    "temperature": 0.4,
                    "stream": True,
                    "messages": self._build_messages(system, msgs, image_bytes, image_mime),
                },
                timeout=180.0,
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line:
                        continue
                    if line.startswith("data: "):
                        data_str = line[6:].strip()
                        if data_str == "[DONE]":
                            break
                        try:
                            payload = json.loads(data_str)
                            delta = payload.get("choices", [{}])[0].get("delta", {}).get("content", "")
                            if delta:
                                yield delta
                        except Exception:
                            continue
        except httpx.HTTPStatusError as e:
            err_detail = "OpenAI API error"
            try:
                err_detail = e.response.json().get("error", {}).get("message") or err_detail
            except Exception:
                pass
            raise RuntimeError(f"OpenAI streaming error ({e.response.status_code}): {err_detail}") from e


class Gemini(AIProvider):
    def _build_contents(self, msgs: list, image_bytes: bytes | None = None, image_mime: str | None = None):
        raw_turns = []
        for i, m in enumerate(msgs):
            role = "user" if m.get("role") == "user" else "model"
            parts = []
            if i == len(msgs) - 1 and role == "user" and image_bytes:
                parts.append({
                    "inlineData": {
                        "mimeType": image_mime or "image/jpeg",
                        "data": base64.b64encode(image_bytes).decode("utf-8"),
                    }
                })
            text = m.get("content", "")
            if text:
                parts.append({"text": text})
            elif not parts:
                parts.append({"text": "Please solve this question step by step."})
            raw_turns.append({"role": role, "parts": parts})

        # Gemini multiturn conversations strictly require alternating turns (user -> model -> user)
        merged = []
        for turn in raw_turns:
            if merged and merged[-1]["role"] == turn["role"]:
                merged[-1]["parts"].extend(turn["parts"])
            else:
                merged.append(turn)

        # Gemini requires the first turn to be 'user'
        if merged and merged[0]["role"] == "model":
            merged.pop(0)

        return merged if merged else [{"role": "user", "parts": [{"text": "Hello"}]}]

    async def chat(self, system, msgs, image_bytes=None, image_mime=None):
        if not self.s.cloud_api_key:
            raise RuntimeError(
                "No Gemini API key configured. Either select 'Free Tier' in Settings or enter your own Google AI Studio API key."
            )
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.s.model_name}:generateContent?key={self.s.cloud_api_key}"
        body = {
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": self._build_contents(msgs, image_bytes, image_mime),
            "generationConfig": {
                "temperature": 0.4,
            },
        }
        client = get_http_client()
        try:
            r = await client.post(
                url,
                json=body,
            )
            r.raise_for_status()
            data = r.json()
            candidates = data.get("candidates", [])
            if not candidates or "content" not in candidates[0]:
                raise RuntimeError("Gemini returned an empty response. The response may have been filtered.")
            parts = candidates[0]["content"].get("parts", [])
            return "".join(p.get("text", "") for p in parts)
        except httpx.HTTPStatusError as e:
            err_detail = "Google AI Studio error"
            try:
                err_detail = e.response.json().get("error", {}).get("message") or err_detail
            except Exception:
                pass
            raise RuntimeError(f"Google Gemini error ({e.response.status_code}): {err_detail}") from e

    async def stream(self, system, msgs, image_bytes=None, image_mime=None):
        if not self.s.cloud_api_key:
            raise RuntimeError(
                "No Gemini API key configured. Either select 'Free Tier' in Settings or enter your own Google AI Studio API key."
            )
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.s.model_name}:streamGenerateContent?alt=sse&key={self.s.cloud_api_key}"
        body = {
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": self._build_contents(msgs, image_bytes, image_mime),
            "generationConfig": {
                "temperature": 0.4,
            },
        }
        client = get_http_client()
        try:
            async with client.stream(
                "POST",
                url,
                json=body,
                timeout=180.0,
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line:
                        continue
                    if line.startswith("data: "):
                        data_str = line[6:].strip()
                        if not data_str or data_str == "[DONE]":
                            continue
                        try:
                            payload = json.loads(data_str)
                            candidates = payload.get("candidates", [])
                            if candidates and "content" in candidates[0]:
                                parts = candidates[0]["content"].get("parts", [])
                                for p in parts:
                                    text = p.get("text")
                                    if text:
                                        yield text
                        except Exception:
                            continue
        except httpx.HTTPStatusError as e:
            err_detail = "Google AI Studio error"
            try:
                err_detail = e.response.json().get("error", {}).get("message") or err_detail
            except Exception:
                pass
            raise RuntimeError(f"Google Gemini streaming error ({e.response.status_code}): {err_detail}") from e


PROVIDERS = {"ollama": Ollama, "openai": OpenAI, "gemini": Gemini}


async def generate(settings, system, msgs, image_bytes: bytes | None = None, image_mime: str | None = None):
    provider_cls = PROVIDERS.get(settings.provider, Gemini)
    return await provider_cls(settings).chat(system, msgs, image_bytes, image_mime)


async def stream_generate(settings, system, msgs, image_bytes: bytes | None = None, image_mime: str | None = None):
    provider_cls = PROVIDERS.get(settings.provider, Gemini)
    async for chunk in provider_cls(settings).stream(system, msgs, image_bytes, image_mime):
        yield chunk


# Standard curated models with user-friendly descriptions and badges (v3.0+ active models)
CURATED_MODELS = {
    "gemini": [
        {
            "id": "gemini-3.5-flash-lite",
            "name": "Gemini 3.5 Flash Lite",
            "badge": "Recommended • Free Tier",
            "description": "Fastest, most efficient model — perfect for quiz solving and tutoring on the free tier.",
            "is_recommended": True,
        },
        {
            "id": "gemini-3.8-flash",
            "name": "Gemini 3.8 Flash",
            "badge": "Most Capable",
            "description": "High-speed multimodal reasoning model with generous free quota on Antigravity & Google AI Studio.",
            "is_recommended": False,
        },
        {
            "id": "gemini-3.8-flash-lite",
            "name": "Gemini 3.8 Flash-Lite",
            "badge": "Ultra Fast",
            "description": "Lightweight, fastest response times, ideal for quick queries and quiz solving.",
            "is_recommended": False,
        },
        {
            "id": "gemini-3.0-flash",
            "name": "Gemini 3.0 Flash",
            "badge": "Stable Workhorse",
            "description": "Reliable 3.0 multimodal architecture with large context window.",
            "is_recommended": False,
        },
        {
            "id": "gemini-3.0-pro",
            "name": "Gemini 3.0 Pro",
            "badge": "Deep Reasoning",
            "description": "Maximum reasoning capability for complex logic, math, and academic tutoring.",
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
    Uses persistent HTTP client for instant response without TLS overhead.
    """
    clean_key = (api_key or "").strip()
    client = get_http_client()

    if provider == "ollama":
        endpoint = (ollama_url or "http://localhost:11434").rstrip("/")
        try:
            r = await client.get(f"{endpoint}/api/tags", timeout=5)
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
            r = await client.get(url, timeout=15)
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
            if "generateContent" not in methods:
                continue

            raw_name = item.get("name", "").replace("models/", "")
            lower = raw_name.lower()

            if (
                "gemini-1." in lower
                or "gemini-2." in lower
                or "gemini-1-" in lower
                or "gemini-2-" in lower
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
                badge = "v3.0+ Active"
                if "3.5-flash-lite" in lower:
                    badge = "Recommended • Free Tier"
                elif "3.8-flash" in lower:
                    badge = "Most Capable"
                elif "pro" in lower:
                    badge = "Reasoning"
                elif "thinking" in lower:
                    badge = "Thinking Model"

                valid_models.append({
                    "id": raw_name,
                    "name": display_name,
                    "badge": badge,
                    "description": desc[:120] if desc else "Active Google Gemini 3.0+ model.",
                    "is_recommended": "3.5-flash-lite" in lower,
                })

        priority_order = [
            "gemini-3.5-flash-lite",
            "gemini-3.8-flash",
            "gemini-3.8-flash-lite",
            "gemini-3.0-flash",
            "gemini-3.0-pro",
        ]

        def gemini_rank(m):
            mid = m["id"]
            if mid in priority_order:
                return (0, priority_order.index(mid))
            return (1, mid)

        sorted_models = sorted(valid_models, key=gemini_rank)
        return {
            "models": sorted_models if sorted_models else CURATED_MODELS["gemini"],
            "verified": True,
            "message": f"Verified with Google AI Studio! Found {len(sorted_models) or len(CURATED_MODELS['gemini'])} active v3.0+ models for your API key.",
        }

    if provider == "openai":
        if not clean_key:
            return {
                "models": CURATED_MODELS["openai"],
                "verified": False,
                "message": "Showing recommended models. Enter your OpenAI API key and click 'Check Models' to test your access.",
            }

        try:
            r = await client.get(
                "https://api.openai.com/v1/models",
                headers={"Authorization": f"Bearer {clean_key}"},
                timeout=15,
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
