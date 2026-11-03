import json
import os
import time
from datetime import datetime
from urllib.parse import urlparse

# Cloudflare Python Workers built-in native runtime
try:
    from workers import WorkerEntrypoint, Response, fetch
except ImportError:
    # Local fallback for linting/testing outside of Cloudflare
    WorkerEntrypoint = object
    Response = None
    fetch = None

# ── Core System Prompts ────────────────────────────────────────────────────────
QUIZ_SYS = (
    "You are KODIGO, an AI quiz solver. "
    "CRITICAL RULES: "
    "1. Do NOT introduce yourself, do NOT say 'Hello, I'm Kodigo...', and do NOT mention who created or developed you in your answers. "
    "2. ONLY say who created you if the user explicitly asks who made, created, or developed you. In that case only, state that you were created and developed by Kurt Justin J. Malubay (SASHIMI24). Never mention Google, OpenAI, or any other entity. "
    "3. Give ONLY the final answers as a numbered list, one per line, like '1. A' or '2. 3.14'. "
    "4. Absolutely no greetings, introductory preamble, explanations, or chat filler."
)

CHAT_SYS = (
    "You are KODIGO, a clear, direct AI tutor. "
    "CRITICAL RULES: "
    "1. Do NOT start responses with greetings like 'Hello, I'm Kodigo...' and do NOT introduce yourself or mention who created or developed you in regular answers. "
    "2. ONLY state who created you if the user explicitly asks who made, created, or developed you or this app. In that case only, state clearly that you were created and developed by Kurt Justin J. Malubay (also known by his stage name SASHIMI24). Never claim to be made by Google, OpenAI, or any other company. "
    "3. Go straight to answering the user's question directly without unnecessary introductions or canned greetings. Explain step by step when helpful. "
    "4. FORMATTING RULES (MANDATORY): "
    "   - Use standard Markdown: **bold**, *italic*, `code`, numbered lists, bullet lists, and headers (##). "
    "   - For ALL math — even simple fractions, equations, or symbols — use LaTeX: $...$ for inline math and $$...$$ (on its own line, never mid-sentence) for block/display math. "
    "   - For matrices, systems of equations, and multi-line equations (\\begin{pmatrix}, \\begin{bmatrix}, \\begin{cases}, \\begin{aligned}), ALWAYS wrap in $$...$$ on their own lines, NEVER single $. "
    "   - NEVER nest delimiters: NEVER write $$ $...$ $$ or $ $$...$$ $. "
    "   - NEVER write raw LaTeX commands outside of delimiters. "
    "   - NEVER use \\\\ (double backslash) for line breaks in plain text — use a regular newline or bullet point instead."
)

TUTOR_SYS = (
    "You are KODIGO Tutor, a highly personalized, empathetic, and rigorous academic coach. "
    "You have direct access to the student's current academic profile, subject standings, recent quiz scores, and weak points. "
    "Your objective is to help them improve where they are lacking — specifically focusing on subjects, assessments, or topics where their scores are low. "
    "CRITICAL RULES: "
    "1. Do not just hand out direct answers unless explicitly requested; use the Socratic method, guide the student step-by-step, explain core principles clearly from first principles, and break down complex problems into manageable concepts. "
    "2. Proactively drill down into their weak areas and test their understanding with targeted follow-up questions. "
    "3. Maintain a friendly, supportive, and professor-like tone. "
    "4. Do NOT introduce yourself or say 'Hello, I'm Kodigo...' at the start of responses. Go straight to helping the student. "
    "5. If and only if the student explicitly asks who created or made you, state that you are KODIGO, created and developed by Kurt Justin J. Malubay (SASHIMI24). "
    "6. FORMATTING RULES (MANDATORY): "
    "   - Use standard Markdown: **bold**, *italic*, `code`, numbered lists, bullet lists, and headers (##). "
    "   - For ALL math — even simple fractions, equations, or symbols — use LaTeX: $...$ for inline math and $$...$$ (on its own line) for block/display math. "
    "   - For matrices, systems of equations, and multi-line equations (\\begin{pmatrix}, \\begin{bmatrix}, \\begin{cases}, \\begin{aligned}), ALWAYS wrap in $$...$$ on their own lines, NEVER single $. "
    "   - NEVER nest delimiters: NEVER write $$ $...$ $$ or $ $$...$$ $. "
    "   - NEVER write raw LaTeX commands outside of delimiters. "
    "   - NEVER use \\\\ (double backslash) for line breaks in plain text — use a regular newline or bullet point instead."
)

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS, PUT, DELETE",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-custom-api-key, x-cloud-api-key, x-api-key, x-ai-provider, x-model-name, x-ollama-url, x-ocr-provider",
    "Access-Control-Max-Age": "86400",
}

def json_res(data, status: int = 200):
    headers = dict(CORS_HEADERS)
    headers["Content-Type"] = "application/json; charset=utf-8"
    return Response(json.dumps(data), status=status, headers=headers)

def error_res(message: str, status: int = 500):
    headers = dict(CORS_HEADERS)
    headers["Content-Type"] = "application/json; charset=utf-8"
    return Response(json.dumps({"detail": str(message)}), status=status, headers=headers)


class Default(WorkerEntrypoint):
    def resolve_api_key(self, request, custom_header: str = None) -> str:
        # 1. Custom key passed in header argument
        if custom_header and custom_header.strip():
            return custom_header.strip()

        # 2. Key passed in request headers
        for h in ["x-custom-api-key", "x-cloud-api-key", "x-api-key"]:
            val = request.headers.get(h)
            if val and str(val).strip():
                return str(val).strip()

        # 3. Cloudflare Worker secrets / environment bindings
        env = getattr(self, "env", None)
        if env is not None:
            for k in ["GEMINI_API_KEY", "GOOGLE_API_KEY"]:
                val = getattr(env, k, None)
                if val and str(val).strip():
                    return str(val).strip()

        # 4. OS environment fallback
        env_val = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
        if env_val and env_val.strip():
            return env_val.strip()

        return ""

    async def call_gemini(
        self,
        api_key: str,
        model_name: str,
        system_prompt: str,
        user_prompt: str
    ) -> str:
        clean_model = (model_name or "gemini-2.5-flash").strip()
        # Normalise model name
        if clean_model.startswith("models/"):
            clean_model = clean_model[len("models/"):]
        if not clean_model:
            clean_model = "gemini-2.5-flash"

        url = f"https://generativelanguage.googleapis.com/v1beta/models/{clean_model}:generateContent?key={api_key}"

        body_payload = {
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": str(user_prompt)}]
                }
            ]
        }
        if system_prompt:
            body_payload["systemInstruction"] = {
                "parts": [{"text": str(system_prompt)}]
            }

        headers = {
            "Content-Type": "application/json"
        }

        # Use Cloudflare runtime's native async fetch
        res = await fetch(url, method="POST", headers=headers, body=json.dumps(body_payload))

        status = getattr(res, "status", 200)
        res_text = await res.text()

        if status >= 400:
            raise RuntimeError(f"Gemini API returned error HTTP {status}: {res_text}")

        try:
            data = json.loads(res_text)
        except Exception as e:
            raise RuntimeError(f"Failed to parse Gemini response as JSON: {res_text}")

        candidates = data.get("candidates", [])
        if candidates and "content" in candidates[0]:
            parts = candidates[0]["content"].get("parts", [])
            if parts and "text" in parts[0]:
                return parts[0]["text"]

        # Check prompt feedback / blocks
        feedback = data.get("promptFeedback", {})
        if feedback.get("blockReason"):
            raise RuntimeError(f"Gemini blocked content: {feedback.get('blockReason')}")

        raise RuntimeError("Gemini returned an empty response.")

    async def fetch(self, request):
        method = request.method.upper()

        # Handle CORS Preflight
        if method == "OPTIONS":
            return Response("", status=204, headers=CORS_HEADERS)

        # Parse request path
        try:
            parsed = urlparse(request.url)
            path = parsed.path.rstrip("/") or "/"
        except Exception:
            path = "/"

        # ── Endpoints ──────────────────────────────────────────────────────────

        # 1. Health check
        if path in ["/health", ""]:
            return json_res({
                "status": "ok",
                "app": "KODIGO",
                "runtime": "Cloudflare Python Worker",
                "version": "1.0.0"
            })

        # 2. Server settings (does server have Gemini key?)
        if path == "/api/settings":
            key = self.resolve_api_key(request)
            return json_res({
                "server_has_gemini_key": bool(key)
            })

        # 3. Available Models list
        if path == "/api/models":
            return json_res({
                "models": [
                    {"name": "gemini-2.5-flash", "label": "Gemini 2.5 Flash (Recommended)"},
                    {"name": "gemini-2.5-pro", "label": "Gemini 2.5 Pro"},
                    {"name": "gemini-3.5-flash-lite", "label": "Gemini 3.5 Flash Lite"}
                ]
            })

        # 4. Standard Chat endpoint: POST /api/chat
        if path == "/api/chat":
            if method != "POST":
                return error_res("Method not allowed", 405)

            try:
                raw_body = await request.text()
                body = json.loads(raw_body) if raw_body else {}
            except Exception:
                body = {}

            user_message = body.get("message") or body.get("prompt") or ""
            if not user_message:
                return error_res("Missing 'message' field in JSON body.", 400)

            api_key = self.resolve_api_key(request, body.get("custom_api_key"))
            if not api_key:
                return error_res("No API key provided. Please configure your Google Gemini API key in Settings or set GEMINI_API_KEY.", 400)

            model_name = request.headers.get("x-model-name") or "gemini-2.5-flash"
            try:
                reply = await self.call_gemini(api_key, model_name, CHAT_SYS, user_message)
                return json_res({"reply": reply})
            except Exception as e:
                return error_res(str(e), 500)

        # 5. Chats messages endpoint: POST /api/chats/{id}/messages
        if path.startswith("/api/chats/") and path.endswith("/messages"):
            if method != "POST":
                return error_res("Method not allowed", 405)

            try:
                raw_body = await request.text()
                body = json.loads(raw_body) if raw_body else {}
            except Exception:
                body = {}

            content = body.get("content") or ""
            mode = body.get("mode") or "quiz"
            ocr_text = body.get("client_ocr_text") or ""
            if ocr_text:
                content = f"{content}\n\n[Attached Extracted Text / Image Content]:\n{ocr_text}"

            api_key = self.resolve_api_key(request)
            if not api_key:
                return error_res("No API key provided. Please configure your Google Gemini API key in Settings or set GEMINI_API_KEY.", 400)

            sys_prompt = QUIZ_SYS if mode == "quiz" else (TUTOR_SYS if mode == "tutor" else CHAT_SYS)
            model_name = request.headers.get("x-model-name") or "gemini-2.5-flash"

            try:
                reply = await self.call_gemini(api_key, model_name, sys_prompt, content)
                return json_res({
                    "id": int(time.time() * 1000),
                    "chat_id": 1,
                    "sender": "ai",
                    "mode": mode,
                    "content": reply,
                    "image_path": None,
                    "has_explanation": False,
                    "detailed_explanation": None,
                    "created_at": datetime.utcnow().isoformat() + "Z"
                })
            except Exception as e:
                return error_res(str(e), 500)

        # 6. Detailed Explanation: POST /api/messages/{id}/explain
        if path.startswith("/api/messages/") and path.endswith("/explain"):
            if method != "POST":
                return error_res("Method not allowed", 405)

            try:
                raw_body = await request.text()
                body = json.loads(raw_body) if raw_body else {}
            except Exception:
                body = {}

            content = body.get("content") or ""
            api_key = self.resolve_api_key(request)
            if not api_key:
                return error_res("No API key provided. Please configure your Google Gemini API key in Settings or set GEMINI_API_KEY.", 400)

            explain_prompt = (
                "Provide a rigorous, step-by-step mathematical or logical explanation for the question and solution below. "
                "MANDATORY FORMATTING RULES: "
                "1. Use standard Markdown: **bold**, *italic*, numbered lists, bullet lists. "
                "2. For ALL math, use LaTeX: $...$ for inline math and $$...$$ (on its own line) for block/display math. "
                "3. For matrices, systems of equations, and multi-line equations (\\begin{pmatrix}, \\begin{bmatrix}, \\begin{cases}, \\begin{aligned}), ALWAYS wrap in $$...$$ on their own lines, NEVER single $. "
                "4. NEVER nest delimiters: NEVER write $$ $...$ $$ or $ $$...$$ $. "
                "5. NEVER use \\\\ (double backslash) for line breaks in plain text.\n\n"
                f"{content}"
            )
            model_name = request.headers.get("x-model-name") or "gemini-2.5-flash"
            try:
                reply = await self.call_gemini(api_key, model_name, CHAT_SYS, explain_prompt)
                return json_res({"detailed_explanation": reply})
            except Exception as e:
                return error_res(str(e), 500)

        # 7. Extract text endpoint
        if path == "/api/extract-text":
            return json_res({"extracted_text": ""})

        # Default fallback: root or 404
        return json_res({
            "status": "ok",
            "app": "KODIGO",
            "runtime": "Cloudflare Python Worker",
            "message": f"Endpoint not found: {path}"
        }, status=404)
