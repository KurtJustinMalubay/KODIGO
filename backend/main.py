from datetime import datetime
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import inspect, text

from models import Base, engine
from routers import chats, references, settings
from core import UPLOADS

Base.metadata.create_all(engine)


def migrate_settings():
    columns = {column["name"] for column in inspect(engine).get_columns("settings")}
    additions = {
        "setup_complete": "BOOLEAN NOT NULL DEFAULT 0",
        "ocr_provider": "VARCHAR DEFAULT 'online'",
        "ocr_api_key": "VARCHAR",
        "font_size": "VARCHAR DEFAULT 'medium'",
        "theme": "VARCHAR DEFAULT 'dark'",
    }
    with engine.begin() as connection:
        for column, definition in additions.items():
            if column not in columns:
                connection.execute(
                    text(f"ALTER TABLE settings ADD COLUMN {column} {definition}")
                )


def migrate_chats():
    columns = {column["name"] for column in inspect(engine).get_columns("chats")}
    additions = {
        "is_pinned": "BOOLEAN NOT NULL DEFAULT 0",
    }
    with engine.begin() as connection:
        for column, definition in additions.items():
            if column not in columns:
                connection.execute(
                    text(f"ALTER TABLE chats ADD COLUMN {column} {definition}")
                )


migrate_settings()
migrate_chats()

app = FastAPI(title="KODIGO")
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
@app.get("/api/ping")
def health_check():
    return {
        "status": "ok",
        "service": "kodigo-backend",
        "timestamp": datetime.utcnow().isoformat(),
    }


app.mount("/uploads", StaticFiles(directory=UPLOADS), name="uploads")
app.include_router(chats.router)
app.include_router(references.router)
app.include_router(settings.router)
