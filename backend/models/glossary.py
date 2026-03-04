from sqlalchemy import Column, Integer, String, Text, ForeignKey
from db import Base

class Glossary(Base):
    __tablename__ = "glossary"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    source_term = Column(String, nullable=False)
    target_term = Column(String, nullable=False)
    note = Column(Text, default="")
