import os
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

from db import engine, Base
import models  # noqa: F401 — trigger model registration

from routers import projects, glossary, translate, export, proxy

Base.metadata.create_all(bind=engine)

app = FastAPI(title="SubtiTool API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "http://localhost:4173", "http://localhost:5000", "http://127.0.0.1:5000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)

app.include_router(projects.router)
app.include_router(glossary.router)
app.include_router(translate.router)
app.include_router(export.router)
app.include_router(proxy.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
