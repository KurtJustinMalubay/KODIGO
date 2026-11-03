import json
import mimetypes
from datetime import datetime

from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from core import build_context, get_settings, resolve_effective_settings, save_upload, serialize
from models import Chat, Message, get_db
from services import extract_text, generate, stream_generate

router = APIRouter()

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


@router.get("/api/chats")
def list_chats(limit: int = 200, offset: int = 0, db: Session = Depends(get_db)):
    chats = (
        db.query(Chat)
        .order_by(Chat.is_pinned.desc(), Chat.updated_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return [serialize(chat) for chat in chats]


@router.post("/api/chats")
def new_chat(db: Session = Depends(get_db)):
    chat = Chat()
    db.add(chat)
    db.commit()
    return serialize(chat)


@router.patch("/api/chats/{chat_id}")
def patch_chat(chat_id: int, body: dict = Body(...), db: Session = Depends(get_db)):
    chat = db.get(Chat, chat_id)
    if not chat:
        raise HTTPException(404, "Chat not found")
    if "is_pinned" in body:
        chat.is_pinned = bool(body["is_pinned"])
    if "title" in body:
        chat.title = str(body["title"])[:255]
    db.commit()
    return serialize(chat)


@router.delete("/api/chats/{chat_id}")
def delete_chat(chat_id: int, db: Session = Depends(get_db)):
    chat = db.get(Chat, chat_id)
    if chat:
        db.delete(chat)
        db.commit()
    return {"ok": True}


@router.get("/api/chats/{chat_id}/export")
def export_chat(chat_id: int, db: Session = Depends(get_db)):
    chat = db.get(Chat, chat_id)
    if not chat:
        raise HTTPException(404, "Chat not found")
    messages = (
        db.query(Message)
        .filter_by(chat_id=chat_id)
        .order_by(Message.id.asc())
        .all()
    )
    return {
        "kodigo_version": "1.0",
        "format": "kod",
        "exported_at": datetime.utcnow().isoformat(),
        "chat": {
            "title": chat.title,
            "is_pinned": chat.is_pinned,
            "created_at": chat.created_at.isoformat() if chat.created_at else None,
        },
        "messages": [
            {
                "sender": m.sender,
                "mode": m.mode,
                "content": m.content,
                "image_path": m.image_path,
                "has_explanation": m.has_explanation,
                "detailed_explanation": m.detailed_explanation,
                "created_at": m.created_at.isoformat() if m.created_at else None,
            }
            for m in messages
        ],
    }


@router.post("/api/chats/import")
async def import_chat(file: UploadFile = File(...), db: Session = Depends(get_db)):
    try:
        content = await file.read()
        data = json.loads(content.decode("utf-8"))
    except Exception as e:
        raise HTTPException(400, f"Invalid .kod file format: {e}")

    chat_data = data.get("chat", {})
    raw_title = chat_data.get("title") or file.filename or "Imported Chat"
    clean_title = raw_title.replace(".kod", "").replace(".json", "").strip() or "Imported Chat"

    new_chat_obj = Chat(
        title=clean_title[:255],
        is_pinned=bool(chat_data.get("is_pinned", False)),
    )
    db.add(new_chat_obj)
    db.commit()
    db.refresh(new_chat_obj)

    messages_data = data.get("messages", [])
    msg_objects = []
    for msg in messages_data:
        msg_obj = Message(
            chat_id=new_chat_obj.id,
            sender=msg.get("sender", "user"),
            mode=msg.get("mode", "quiz"),
            content=msg.get("content", ""),
            image_path=msg.get("image_path"),
            has_explanation=bool(msg.get("has_explanation", False)),
            detailed_explanation=msg.get("detailed_explanation"),
        )
        msg_objects.append(msg_obj)

    if msg_objects:
        db.add_all(msg_objects)
        db.commit()

    return {
        "chat": serialize(new_chat_obj),
        "messages": [serialize(m) for m in msg_objects],
    }


@router.post("/api/chats/batch")
def batch_chats(chat_ids: list[int] = Body(..., embed=True), db: Session = Depends(get_db)):
    if not chat_ids:
        return []
    chats = db.query(Chat).filter(Chat.id.in_(chat_ids)).all()
    return [serialize(chat) for chat in chats]


@router.get("/api/chats/{chat_id}/messages")
def get_messages(
    chat_id: int,
    limit: int = 200,
    offset: int = 0,
    db: Session = Depends(get_db),
):
    messages = (
        db.query(Message)
        .filter_by(chat_id=chat_id)
        .order_by(Message.id.asc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return [serialize(message) for message in messages]


async def _prepare_chat_context(
    chat_id: str,
    content: str,
    mode: str,
    image: UploadFile | None,
    client_ocr_text: str,
    history_json: str,
    context_text: str,
    db: Session,
    request: Request,
):
    chat = None
    try:
        chat = db.get(Chat, int(chat_id))
    except Exception:
        pass

    if not chat:
        try:
            chat = Chat(id=int(chat_id) if str(chat_id).isdigit() else None)
            db.add(chat)
            db.commit()
            db.refresh(chat)
        except Exception:
            chat = Chat()

    image_url = None
    ocr_text = ""
    image_bytes = None
    image_mime = None
    settings = resolve_effective_settings(db, request)

    if image:
        path = save_upload(image)
        image_url = "/" + path.replace("\\", "/")
        image_mime = mimetypes.guess_type(path)[0] or "image/jpeg"

        if client_ocr_text and client_ocr_text.strip():
            ocr_text = client_ocr_text.strip()
        elif settings.provider in ("gemini", "openai"):
            # Native multimodal vision: read directly for 10x faster response and higher accuracy
            try:
                with open(path, "rb") as f:
                    image_bytes = f.read()
            except Exception:
                pass
        else:
            try:
                ocr_text = await extract_text(path, settings)
            except Exception as e:
                print(f"[OCR extraction fallback]: {e}")

    text = (content + "\n" + ocr_text).strip()
    if not text and not image_bytes:
        raise HTTPException(400, "Empty message")
    if not text and image_bytes:
        text = "Please solve this question or problem step-by-step."

    if mode == "quiz" and not image and len(text.split()) > 80:
        mode = "chat"

    if mode == "quiz":
        system = QUIZ_SYS
    elif mode == "tutor":
        system = TUTOR_SYS
    else:
        system = CHAT_SYS

    reference_corpus = context_text.strip() if context_text else (build_context(db, chat.id) if chat.id else "")
    if reference_corpus:
        system += "\n\nReference material:\n" + reference_corpus[:12000]

    history = []
    if history_json and history_json.strip():
        try:
            history = json.loads(history_json)
        except Exception:
            history = []
    elif mode == "chat" and chat.id:
        previous = (
            db.query(Message)
            .filter_by(chat_id=chat.id)
            .order_by(Message.id.desc())
            .limit(10)
            .all()
        )
        history = [
            {
                "role": "user" if message.sender == "user" else "assistant",
                "content": message.content,
            }
            for message in reversed(previous)
        ]

    return {
        "chat": chat,
        "settings": settings,
        "system": system,
        "history": history,
        "text": text,
        "mode": mode,
        "image_url": image_url,
        "image_bytes": image_bytes,
        "image_mime": image_mime,
    }


@router.post("/api/chats/{chat_id}/stream")
async def stream_chat_message(
    chat_id: str,
    request: Request,
    content: str = Form(""),
    mode: str = Form("quiz"),
    image: UploadFile = File(None),
    client_ocr_text: str = Form(""),
    history_json: str = Form(""),
    context_text: str = Form(""),
    db: Session = Depends(get_db),
):
    """
    Ultra-low latency streaming response via Server-Sent Events (SSE).
    Returns tokens in real time as generated by Gemini/OpenAI/Ollama.
    """
    prepared = await _prepare_chat_context(
        chat_id=chat_id,
        content=content,
        mode=mode,
        image=image,
        client_ocr_text=client_ocr_text,
        history_json=history_json,
        context_text=context_text,
        db=db,
        request=request,
    )

    chat = prepared["chat"]
    settings = prepared["settings"]
    system = prepared["system"]
    history = prepared["history"]
    text = prepared["text"]
    active_mode = prepared["mode"]
    image_url = prepared["image_url"]
    image_bytes = prepared["image_bytes"]
    image_mime = prepared["image_mime"]

    user_data = {
        "chat_id": chat.id or chat_id,
        "sender": "user",
        "mode": active_mode,
        "content": text,
        "image_path": image_url,
    }

    user_msg_db = None
    try:
        if chat.id:
            user_msg_db = Message(**user_data)
            db.add(user_msg_db)
            if chat.title in ("New Chat", "New Tutoring Session", "New Tutor Session") or not chat.title:
                chat.title = (content or text)[:40]
            chat.updated_at = datetime.utcnow()
            db.commit()
            db.refresh(user_msg_db)
    except Exception:
        pass

    user_serialized = serialize(user_msg_db) if user_msg_db else {
        **user_data,
        "id": int(datetime.utcnow().timestamp() * 1000)
    }

    msgs_payload = history + [{"role": "user", "content": text}]

    async def sse_event_stream():
        # First event: start event containing user message metadata
        yield f"data: {json.dumps({'type': 'start', 'user': user_serialized, 'mode': active_mode}, default=str)}\n\n"
        full_tokens = []
        try:
            async for delta in stream_generate(settings, system, msgs_payload, image_bytes, image_mime):
                full_tokens.append(delta)
                yield f"data: {json.dumps({'type': 'chunk', 'delta': delta})}\n\n"
        except Exception as err:
            yield f"data: {json.dumps({'type': 'error', 'error': str(err)})}\n\n"
            return

        final_reply = "".join(full_tokens)
        ai_data = {
            "chat_id": chat.id or chat_id,
            "sender": "ai",
            "mode": active_mode,
            "content": final_reply,
        }
        ai_msg_db = None
        try:
            if chat.id:
                ai_msg_db = Message(**ai_data)
                db.add(ai_msg_db)
                chat.updated_at = datetime.utcnow()
                db.commit()
                db.refresh(ai_msg_db)
        except Exception:
            pass

        ai_serialized = serialize(ai_msg_db) if ai_msg_db else {
            **ai_data,
            "id": int(datetime.utcnow().timestamp() * 1000) + 1
        }
        ai_serialized["content"] = final_reply
        yield f"data: {json.dumps({'type': 'done', 'reply': final_reply, 'ai': ai_serialized, 'mode': active_mode}, default=str)}\n\n"

    return StreamingResponse(
        sse_event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/api/chats/{chat_id}/messages")
async def send_message(
    chat_id: str,
    request: Request,
    content: str = Form(""),
    mode: str = Form("quiz"),
    image: UploadFile = File(None),
    client_ocr_text: str = Form(""),
    history_json: str = Form(""),
    context_text: str = Form(""),
    db: Session = Depends(get_db),
):
    prepared = await _prepare_chat_context(
        chat_id=chat_id,
        content=content,
        mode=mode,
        image=image,
        client_ocr_text=client_ocr_text,
        history_json=history_json,
        context_text=context_text,
        db=db,
        request=request,
    )

    chat = prepared["chat"]
    settings = prepared["settings"]
    system = prepared["system"]
    history = prepared["history"]
    text = prepared["text"]
    active_mode = prepared["mode"]
    image_url = prepared["image_url"]
    image_bytes = prepared["image_bytes"]
    image_mime = prepared["image_mime"]

    try:
        reply = await generate(
            settings,
            system,
            history + [{"role": "user", "content": text}],
            image_bytes=image_bytes,
            image_mime=image_mime,
        )
    except Exception as error:
        raise HTTPException(502, f"AI provider error: {error}") from error

    user_data = {
        "chat_id": chat.id or chat_id,
        "sender": "user",
        "mode": active_mode,
        "content": text,
        "image_path": image_url,
    }
    ai_data = {
        "chat_id": chat.id or chat_id,
        "sender": "ai",
        "mode": active_mode,
        "content": reply,
    }

    try:
        if chat.id:
            user_msg_db = Message(**user_data)
            ai_msg_db = Message(**ai_data)
            db.add_all([user_msg_db, ai_msg_db])
            if chat.title in ("New Chat", "New Tutoring Session", "New Tutor Session") or not chat.title:
                chat.title = (content or text)[:40]
            chat.updated_at = datetime.utcnow()
            db.commit()
            return {
                "user": serialize(user_msg_db),
                "ai": serialize(ai_msg_db),
                "mode": active_mode,
            }
    except Exception:
        pass

    return {
        "user": {**user_data, "id": int(datetime.utcnow().timestamp() * 1000)},
        "ai": {**ai_data, "id": int(datetime.utcnow().timestamp() * 1000) + 1},
        "mode": active_mode,
    }


@router.post("/api/messages/{message_id}/explain")
async def explain_message(
    message_id: str,
    request: Request,
    item: int | None = Body(None, embed=True),
    question_content: str | None = Body(None, embed=True),
    answer_content: str | None = Body(None, embed=True),
    context_text: str | None = Body(None, embed=True),
    db: Session = Depends(get_db),
):
    ai_message = None
    try:
        ai_message = db.get(Message, int(message_id))
    except Exception:
        pass

    if item is None and ai_message and ai_message.detailed_explanation:
        return {"explanation": ai_message.detailed_explanation}

    q_text = question_content
    a_text = answer_content or (ai_message.content if ai_message else "")

    if not q_text and ai_message:
        question = (
            db.query(Message)
            .filter(
                Message.chat_id == ai_message.chat_id,
                Message.sender == "user",
                Message.id < ai_message.id,
            )
            .order_by(Message.id.desc())
            .first()
        )
        if question:
            q_text = question.content

    target = f"item #{item} only" if item else "every item"
    prompt = (
        f"Questions:\n{q_text or ''}\n\n"
        f"Given answers:\n{a_text or ''}\n\n"
        f"Give a detailed step-by-step explanation/proof for {target}. "
        "Do NOT introduce yourself, do NOT say 'Hello, I am Kodigo...', and do NOT mention who created you. "
        "Go straight to the explanation. "
        "Use LaTeX for math: $...$ for inline and $$...$$ on its own line for block math/matrices. "
        "Never nest $ inside $$, and never use \\\\ for line breaks in text."
    )
    system = CHAT_SYS

    ref_context = (context_text or "").strip()
    if not ref_context and ai_message:
        ref_context = build_context(db, ai_message.chat_id)
    if ref_context:
        system += "\n\nReference material:\n" + ref_context[:12000]

    try:
        settings = resolve_effective_settings(db, request)
        text = await generate(
            settings, system, [{"role": "user", "content": prompt}]
        )
    except Exception as error:
        raise HTTPException(502, f"AI provider error: {error}") from error

    if item is None and ai_message:
        try:
            ai_message.has_explanation = True
            ai_message.detailed_explanation = text
            db.commit()
        except Exception:
            pass

    return {"explanation": text}
