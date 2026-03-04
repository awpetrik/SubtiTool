from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.sql import func
from db import Base

class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    genre = Column(String, default="")
    char_context = Column(String, default="")  # nama karakter penting
    lang_from = Column(String, default="en")
    lang_to = Column(String, default="id")
    engine = Column(String, default="gemini")  # gemini | google_free | libretranslate
    created_at = Column(DateTime(timezone=True), server_default=func.now())
