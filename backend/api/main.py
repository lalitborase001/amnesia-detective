"""
api/main.py  —  FastAPI app entry point
Run: uvicorn backend.api.main:app --reload
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routes import router
import cognee

app = FastAPI(title="Amnesia Detective API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite dev server
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.on_event("startup")
async def startup():
    # Cognee global init — LLM provider set per-request in memory_ops.py
    cognee.config.set_llm_config({
        "provider": "anthropic",
        "model": "claude-sonnet-4-6",
    })


@app.get("/health")
async def health():
    return {"status": "ok", "service": "Amnesia Detective"}