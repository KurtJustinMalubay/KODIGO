from datetime import datetime

from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from core import build_context, get_settings, save_upload, serialize
from models import Chat, Message, get_db
from services import generate, extract_text

router = APIRouter()

QUIZ_SYS = (
    "You are KODIGO, a quiz solver. Give ONLY the final answers as a numbered list, "
    "one per line, like '1. A' or '2. 3.14'. No explanations."
)
CHAT_SYS = (
    "You are KODIGO, a clear, friendly tutor. Explain step by step. "
    "Use LaTeX with $...$ for inline and $$...$$ for block math."
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
    chat_id: int,
    content: str = Form(""),
    mode: str = Form("quiz"),
    image: UploadFile = File(None),
    client_ocr_text: str = Form(""),
    db: Session = Depends(get_db),
):
    chat = db.get(Chat, chat_id)
    if not chat:
        raise HTTPException(404, "Chat not found")

    image_url, ocr_text = None, ""
    settings = get_settings(db)
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
    context = build_context(db, chat_id)
    if context:
        system += "\n\nReference material:\n" + context

    history = []
    if mode == "chat":
        previous = (
            db.query(Message)
            .filter_by(chat_id=chat_id)
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

    user_message = Message(
        chat_id=chat_id,
        sender="user",
        mode=mode,
        content=text,
        image_path=image_url,
    )
    ai_message = Message(chat_id=chat_id, sender="ai", mode=mode, content=reply)
    db.add_all([user_message, ai_message])
    if chat.title == "New Chat":
        chat.title = (content or text)[:40]
    chat.updated_at = datetime.utcnow()
    db.commit()
    return {
        "user": serialize(user_message),
        "ai": serialize(ai_message),
        "mode": mode,
    }


@router.post("/api/messages/{message_id}/explain")
async def explain_message(
    message_id: int,
    item: int | None = Body(None, embed=True),
    db: Session = Depends(get_db),
):
    ai_message = db.get(Message, message_id)
    if not ai_message:
        raise HTTPException(404, "Message not found")
    if item is None and ai_message.detailed_explanation:
        return {"explanation": ai_message.detailed_explanation}

    question = (
        db.query(Message)
        .filter(
            Message.chat_id == ai_message.chat_id,
            Message.sender == "user",
            Message.id < message_id,
        )
        .order_by(Message.id.desc())
        .first()
    )
    target = f"item #{item} only" if item else "every item"
    prompt = (
        f"Questions:\n{question.content if question else ''}\n\n"
        f"Given answers:\n{ai_message.content}\n\n"
        f"Give a detailed step-by-step explanation/proof for {target}. "
        "Use LaTeX ($...$, $$...$$) for math."
    )
    system = CHAT_SYS
    context = build_context(db, ai_message.chat_id)
    if context:
        system += "\n\nReference material:\n" + context
    try:
        text = await generate(
            get_settings(db), system, [{"role": "user", "content": prompt}]
        )
    except Exception as error:
        raise HTTPException(502, f"AI provider error: {error}") from error
    if item is None:
        ai_message.has_explanation = True
        ai_message.detailed_explanation = text
        db.commit()
    return {"explanation": text}
