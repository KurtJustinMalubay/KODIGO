from datetime import datetime
from sqlalchemy import create_engine, Column, Integer, String, Text, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import declarative_base, sessionmaker, relationship

engine = create_engine("sqlite:///kodigo.db", connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine, autoflush=False)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

class Chat(Base):
    __tablename__ = "chats"
    id = Column(Integer, primary_key=True)
    title = Column(String(255), default="New Chat")
    is_pinned = Column(Boolean, default=False, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, index=True)
    messages = relationship("Message", cascade="all, delete-orphan")
    references = relationship("Reference", cascade="all, delete-orphan")

class Message(Base):
    __tablename__ = "messages"
    id = Column(Integer, primary_key=True)
    chat_id = Column(Integer, ForeignKey("chats.id", ondelete="CASCADE"), index=True)
    sender = Column(String(10))  # user | ai
    mode = Column(String(10))    # quiz | chat
    content = Column(Text)
    image_path = Column(String, nullable=True)
    has_explanation = Column(Boolean, default=False)
    detailed_explanation = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class Reference(Base):
    __tablename__ = "references"
    id = Column(Integer, primary_key=True)
    chat_id = Column(Integer, ForeignKey("chats.id", ondelete="CASCADE"))
    filename = Column(String)
    file_path = Column(String)
    extracted_text = Column(Text)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class UniversalReference(Base):
    __tablename__ = "universal_references"
    id = Column(Integer, primary_key=True)
    filename = Column(String)
    file_path = Column(String)
    extracted_text = Column(Text)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class Setting(Base):
    __tablename__ = "settings"
    id = Column(Integer, primary_key=True)
    provider = Column(String, default="ollama")  # ollama | openai | gemini
    model_name = Column(String, default="llama3")
    ollama_url = Column(String, default="http://localhost:11434")
    cloud_api_key = Column(String, nullable=True)
    default_mode = Column(String, default="quiz")
    setup_complete = Column(Boolean, default=False, nullable=False)
    ocr_provider = Column(String, default="online")  # online | tesseract
    ocr_api_key = Column(String, nullable=True)
    font_size = Column(String, default="medium")
    theme = Column(String, default="dark")
