from sqlalchemy import Column, Integer, String, Text, ForeignKey
from db import Base

VALID_STATUSES = {"pending", "ai_done", "flagged", "in_review", "approved"}

class Segment(Base):
    __tablename__ = "segments"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    index = Column(Integer, nullable=False)        # nomor urut di SRT
    timecode_start = Column(String, nullable=False)
    timecode_end = Column(String, nullable=False)
    original = Column(Text, nullable=False)
    translation = Column(Text, default="")
    # "pending" | "ai_done" | "flagged" | "in_review" | "approved"
    status = Column(String, default="pending")
    flag_note = Column(Text, default="")
