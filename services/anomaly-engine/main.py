from contextlib import asynccontextmanager
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException

from model import ModelBundle, ScoreRequest, ScoreResponse


def create_app(model_path=None):
    artifact_path = Path(model_path or os.environ.get("MODEL_PATH", "artifacts/isolation-forest.joblib"))

    @asynccontextmanager
    async def lifespan(application):
        application.state.model = ModelBundle.load(artifact_path) if artifact_path.is_file() else None
        yield

    application = FastAPI(title="InvoiceIQ Anomaly Engine", lifespan=lifespan)

    @application.get("/health")
    def health():
        return {"status": "ok", "model_loaded": application.state.model is not None}

    @application.get("/ready")
    def ready():
        if application.state.model is None:
            raise HTTPException(status_code=503, detail="Train and deploy a model artifact before scoring")
        return {"status": "ready", "model_version": application.state.model.version}

    @application.post("/score", response_model=ScoreResponse)
    def score(request: ScoreRequest):
        if application.state.model is None:
            raise HTTPException(status_code=503, detail="No trained model is loaded")
        return application.state.model.score(request.features)

    return application


app = create_app()