# backend/app/models/note.py
import uuid

from sqlalchemy import Float, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID, TSVECTOR
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class Project(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "projects"

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    user = relationship("User", back_populates="projects")
    notes = relationship("Note", back_populates="project", cascade="all, delete-orphan")


class Note(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "notes"

    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"))
    title: Mapped[str] = mapped_column(String(300))
    audio_path: Mapped[str] = mapped_column(String(500))
    duration_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    language: Mapped[str | None] = mapped_column(String(10), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="uploading")

    project = relationship("Project", back_populates="notes")
    transcript = relationship("Transcript", back_populates="note", uselist=False, cascade="all, delete-orphan")
    analysis = relationship("Analysis", back_populates="note", uselist=False, cascade="all, delete-orphan")
    bookmarks = relationship("Bookmark", back_populates="note", cascade="all, delete-orphan")
    chat_sessions = relationship("ChatSession", back_populates="note", cascade="all, delete-orphan")


class Transcript(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "transcripts"

    note_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("notes.id"), unique=True)
    segments: Mapped[dict] = mapped_column(JSONB, default=list)
    full_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    search_vector: Mapped[str | None] = mapped_column(TSVECTOR, nullable=True)

    note = relationship("Note", back_populates="transcript")


class Analysis(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "analyses"

    note_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("notes.id"), unique=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    topics: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    keywords: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    action_items: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    note = relationship("Note", back_populates="analysis")


class Bookmark(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "bookmarks"

    note_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("notes.id"))
    timestamp_seconds: Mapped[float] = mapped_column(Float)
    label: Mapped[str] = mapped_column(String(200))

    note = relationship("Note", back_populates="bookmarks")


class ChatSession(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "chat_sessions"

    note_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("notes.id"))
    messages: Mapped[dict] = mapped_column(JSONB, default=list)

    note = relationship("Note", back_populates="chat_sessions")
