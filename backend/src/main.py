import json
import os
import time
from datetime import datetime
from fastapi import Body, FastAPI, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Cloudflare Python Workers runtime provides `workers.asgi`
try:
    from workers import asgi
except ImportError:
    asgi = None

app = FastAPI(title="KODIGO Backend", version="1.0.0")

# Allow CORS requests from Cloudflare Pages, localhost, and all custom origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://kodigo.pages.dev",
        "https://kodigo-frontend.pages.dev",
        "http://localhost:5173",
        "http://localhost:3000",
        "*"
    ],
    allow_origin_regex=r"https://.*\.pages\.dev",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Core System Prompts ───────────────────────────────────────────────────────
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
    "   - NEVER use \\\\ (double backslash) for line breaks in plain text — use a regular newline or bullet point instead. "
)

TUTOR_SYS = (
    "You are KODIGO Tutor, a highly personalized, empathetic, and rigorous academic coach. "
    "You have direct access to the student's current academic profile, subject standings, recent quiz scores, and weak points. "
    "Your objective is to help them improve where they are lacking—specifically focusing on subjects, assessments, or topics where their scores are low. "
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
    "   - NEVER use \\\\ (double backslash) for line breaks in plain text — use a regular newline or bullet point instead. "
)

# ── Dynamic API Key Resolution ────────────────────────────────────────────────
def resolve_api_key(request: Request = None, custom_header_key: str = None) -> str:
    # 1. Custom key passed in header
    if custom_header_key and custom_header_key.strip():
        return custom_header_key.strip()
    if request:
        for header_name in ["x-custom-api-key", "x-cloud-api-key", "x-api-key"]:
            val = request.headers.get(header_name)
            if val and val.strip():
                return val.strip()
    # 2. Server/Worker environment variable fallback
    env_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if env_key and env_key.strip():
        return env_key.strip()
    return ""

# ── Gemini Content Generation Helper ──────────────────────────────────────────
async def generate_gemini(
    api_key: str,
    model_name: str,
    system_instruction: str,
    contents: str | list
) -> str:
    if not api_key:
        raise HTTPException(
            status_code=400,
            detail="No API key provided. Please configure your Google Gemini API key in Settings or set GEMINI_API_KEY."
        )

    clean_model = model_name or "gemini-2.5-flash"

    # Attempt 1: Try official `google.genai` SDK
    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=api_key)
        config = types.GenerateContentConfig(
            system_instruction=system_instruction if system_instruction else None,
        ) if system_instruction else None

        response = client.models.generate_content(
            model=clean_model,
            contents=contents if isinstance(contents, str) else "\n".join(str(c) for c in contents),
            config=config,
        )
        if response and response.text:
            return response.text
    except Exception as sdk_err:
        # Fallback to direct HTTP REST endpoint
        pass

    # Attempt 2: Direct REST call via urllib or httpx
    try:
        import httpx
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{clean_model}:generateContent?key={api_key}"
        parts = [{"text": contents}] if isinstance(contents, str) else [{"text": str(c)} for c in contents]
        body = {"contents": [{"role": "user", "parts": parts}]}
        if system_instruction:
            body["systemInstruction"] = {"parts": [{"text": system_instruction}]}

        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(url, json=body)
            resp.raise_for_status()
            data = resp.json()
            candidates = data.get("candidates", [])
            if candidates and "content" in candidates[0]:
                return candidates[0]["content"]["parts"][0]["text"]
            raise RuntimeError("Gemini returned an empty candidate list.")
    except Exception as http_err:
        # Attempt 3: Standard library urllib.request (Pyodide native JS fetch bridge)
        try:
            import urllib.request
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{clean_model}:generateContent?key={api_key}"
            parts = [{"text": contents}] if isinstance(contents, str) else [{"text": str(c)} for c in contents]
            body = {"contents": [{"role": "user", "parts": parts}]}
            if system_instruction:
                body["systemInstruction"] = {"parts": [{"text": system_instruction}]}
            req = urllib.request.Request(
                url,
                data=json.dumps(body).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=120) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                candidates = data.get("candidates", [])
                if candidates and "content" in candidates[0]:
                    return candidates[0]["content"]["parts"][0]["text"]
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=f"Gemini API error: {http_err}")

# ── Phase 1: ChatRequest Endpoint (Template requirement) ─────────────────────
class ChatRequest(BaseModel):
    message: str

@app.post("/api/chat")
async def chat_endpoint(
    request: ChatRequest,
    x_custom_api_key: str = Header(None),
    x_model_name: str = Header(None)
):
    active_api_key = x_custom_api_key or os.environ.get("GEMINI_API_KEY")
    if not active_api_key:
        raise HTTPException(
            status_code=400,
            detail="No API key provided. Please configure an API key."
        )

    model = x_model_name or "gemini-2.5-flash"
    try:
        reply = await generate_gemini(
            api_key=active_api_key,
            model_name=model,
            system_instruction=CHAT_SYS,
            contents=request.message,
        )
        return {"reply": reply}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ── KODIGO App Endpoints (Full compatibility with React frontend) ─────────────
@app.get("/")
@app.get("/health")
def health():
    return {"status": "ok", "app": "KODIGO", "runtime": "Cloudflare Python Worker"}

@app.post("/api/chats/{chat_id}/messages")
async def send_message(
    chat_id: str,
    request: Request,
    content: str = Form(""),
    mode: str = Form("quiz"),
    image: UploadFile = File(None),
    client_ocr_text: str = Form(""),
    history_json: str = Form(""),
    context_text: str = Form(""),
):
    text = (content + "\n" + (client_ocr_text or "")).strip()
    if not text:
        raise HTTPException(400, "Empty message")

    if mode == "quiz" and len(text.split()) > 80:
        mode = "chat"

    if mode == "quiz":
        system = QUIZ_SYS
    elif mode == "tutor":
        system = TUTOR_SYS
    else:
        system = CHAT_SYS

    if context_text and context_text.strip():
        system += "\n\nReference material:\n" + context_text.strip()[:12000]

    api_key = resolve_api_key(request)
    model = request.headers.get("x-model-name") or "gemini-2.5-flash"

    # Assemble conversation context
    full_prompt = text
    if history_json and history_json.strip():
        try:
            history = json.loads(history_json)
            formatted_history = []
            for h in history[-8:]:
                role = "User" if h.get("role") == "user" else "Assistant"
                formatted_history.append(f"{role}: {h.get('content', '')}")
            if formatted_history:
                full_prompt = "\n".join(formatted_history) + f"\nUser: {text}"
        except Exception:
            pass

    reply = await generate_gemini(
        api_key=api_key,
        model_name=model,
        system_instruction=system,
        contents=full_prompt,
    )

    now_ms = int(time.time() * 1000)
    user_msg = {
        "id": now_ms,
        "chat_id": chat_id,
        "sender": "user",
        "mode": mode,
        "content": text,
        "created_at": datetime.utcnow().isoformat(),
    }
    ai_msg = {
        "id": now_ms + 1,
        "chat_id": chat_id,
        "sender": "ai",
        "mode": mode,
        "content": reply,
        "created_at": datetime.utcnow().isoformat(),
    }

    return {
        "user": user_msg,
        "ai": ai_msg,
        "mode": mode,
    }

@app.post("/api/messages/{message_id}/explain")
async def explain_message(
    message_id: str,
    request: Request,
    payload: dict = Body(default={})
):
    item = payload.get("item")
    q_text = payload.get("question_content") or ""
    a_text = payload.get("answer_content") or ""
    context_text = payload.get("context_text") or ""

    target = f"item #{item} only" if item else "every item"
    prompt = (
        f"Questions:\n{q_text}\n\n"
        f"Given answers:\n{a_text}\n\n"
        f"Give a detailed step-by-step explanation/proof for {target}. "
        "Do NOT introduce yourself, do NOT say 'Hello, I am Kodigo...', and do NOT mention who created you. "
        "Go straight to the explanation. "
        "Use LaTeX for math: $...$ for inline and $$...$$ on its own line for block math/matrices. "
        "Never nest $ inside $$, and never use \\\\ for line breaks in text."
    )

    system = CHAT_SYS
    if context_text and context_text.strip():
        system += "\n\nReference material:\n" + context_text.strip()[:12000]

    api_key = resolve_api_key(request)
    model = request.headers.get("x-model-name") or "gemini-2.5-flash"

    explanation = await generate_gemini(
        api_key=api_key,
        model_name=model,
        system_instruction=system,
        contents=prompt,
    )

    return {"explanation": explanation}

@app.post("/api/models")
async def list_models(request: Request):
    return {
        "models": [
            {
                "id": "gemini-2.5-flash",
                "name": "Gemini 2.5 Flash",
                "badge": "Recommended • Fast",
                "description": "Next-gen multimodal reasoning model with fast response times.",
                "is_recommended": True,
            },
            {
                "id": "gemini-3.5-flash-lite",
                "name": "Gemini 3.5 Flash Lite",
                "badge": "Free Tier",
                "description": "Lightweight, ultra-fast model ideal for quiz solving.",
                "is_recommended": False,
            },
            {
                "id": "gemini-3.8-flash",
                "name": "Gemini 3.8 Flash",
                "badge": "Most Capable",
                "description": "High-speed reasoning model for complex STEM problem solving.",
                "is_recommended": False,
            },
        ],
        "verified": True,
        "message": "Connected to Cloudflare Worker backend.",
    }

@app.get("/api/settings")
def get_settings():
    return {
        "provider": "gemini",
        "model_name": "gemini-2.5-flash",
        "font_size": "medium",
        "theme": "dark",
        "setup_complete": True,
    }

@app.post("/api/extract-text")
async def extract_text_endpoint(file: UploadFile = File(...)):
    try:
        content = await file.read()
        text = content.decode("utf-8", errors="ignore")
        return {"extracted_text": text}
    except Exception as e:
        return {"extracted_text": "", "error": str(e)}

# ── Cloudflare Workers ASGI Entrypoint ────────────────────────────────────────
if asgi is not None:
    Default = asgi.entrypoint(app)
    default = Default
    entrypoint = Default
else:
    Default = app
    default = app
    entrypoint = app
