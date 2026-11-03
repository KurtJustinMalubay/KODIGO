from datetime import datetime

from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, Request, UploadFile
from sqlalchemy.orm import Session

from core import build_context, get_settings, resolve_effective_settings, save_upload, serialize
from models import Chat, Message, get_db
from services import generate, extract_text

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
    "3. Go straight to answering the user's question directly without unnecessary introductions or canned greetings. Explain step by step when helpful. Use LaTeX with $...$ for inline and $$...$$ for block math."
)


@router.get("/api/chats")
def list_chats(limit: int = 200, offset: int = 0, db: Session = Depends(get_db)):
    # Optimized query: sorts pinned chats first, then newest updated, with efficient limit
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
    import json
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
    """Efficient batch processing endpoint to fetch multiple chats in a single DB query."""
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
    # Retrieve only the messages belonging to the requested chat (lazy on-demand retrieval)
    messages = (
        db.query(Message)
        .filter_by(chat_id=chat_id)
        .order_by(Message.id.asc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return [serialize(message) for message in messages]


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
    # Lookup chat if integer ID, or create transient record if needed
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

    image_url, ocr_text = None, ""
    # Per-request settings: uses device's private credentials from headers
    settings = resolve_effective_settings(db, request)
    if image:
        path = save_upload(image)
        image_url = "/" + path.replace("\\", "/")
        if client_ocr_text and client_ocr_text.strip():
            ocr_text = client_ocr_text.strip()
        else:
            try:
                ocr_text = await extract_text(path, settings)
            except Exception as error:
                raise HTTPException(502, f"OCR provider error: {error}") from error

    text = (content + "\n" + ocr_text).strip()
    if not text:
        raise HTTPException(400, "Empty message")
    if mode == "quiz" and not image and len(text.split()) > 80:
        mode = "chat"

    system = QUIZ_SYS if mode == "quiz" else CHAT_SYS

    # Priority to device-passed reference context
    reference_corpus = context_text.strip() if context_text else (build_context(db, chat.id) if chat.id else "")
    if reference_corpus:
        system += "\n\nReference material:\n" + reference_corpus[:12000]

    history = []
    if history_json and history_json.strip():
        import json
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
    try:
        reply = await generate(
            settings, system, history + [{"role": "user", "content": text}]
        )
    except Exception as error:
        raise HTTPException(502, f"AI provider error: {error}") from error

    user_data = {
        "chat_id": chat.id or chat_id,
        "sender": "user",
        "mode": mode,
        "content": text,
        "image_path": image_url,
    }
    ai_data = {
        "chat_id": chat.id or chat_id,
        "sender": "ai",
        "mode": mode,
        "content": reply,
    }

    try:
        if chat.id:
            user_msg_db = Message(**user_data)
            ai_msg_db = Message(**ai_data)
            db.add_all([user_msg_db, ai_msg_db])
            if chat.title == "New Chat":
                chat.title = (content or text)[:40]
            chat.updated_at = datetime.utcnow()
            db.commit()
            return {
                "user": serialize(user_msg_db),
                "ai": serialize(ai_msg_db),
                "mode": mode,
            }
    except Exception:
        pass

    return {
        "user": {**user_data, "id": int(datetime.utcnow().timestamp() * 1000)},
        "ai": {**ai_data, "id": int(datetime.utcnow().timestamp() * 1000) + 1},
        "mode": mode,
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
        "Go straight to the explanation. Use LaTeX ($...$, $$...$$) for math."
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
