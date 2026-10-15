
from pathlib import Path

import joblib
import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

MODEL_PATH = Path(__file__).resolve().parent / "chefmate_intent_svm.joblib"

if not MODEL_PATH.exists():
    raise FileNotFoundError(
        f"Model not found: {MODEL_PATH}. Run train_model.py first."
    )

model = joblib.load(MODEL_PATH)
app = FastAPI(title="ChefMate Intent API")


class CommandRequest(BaseModel):
    text: str


@app.get("/health")
def health():
    return {"status": "ready", "model": "Linear SVM"}


@app.post("/predict")
def predict(request: CommandRequest):
    text = request.text.strip()

    if not text:
        raise HTTPException(
            status_code=400,
            detail="Command text cannot be empty."
        )

    intent = str(model.predict([text])[0])
    response = {"intent": intent}

    # LinearSVC provides decision scores, not calibrated probabilities.
    if hasattr(model, "decision_function"):
        scores = np.asarray(model.decision_function([text])).reshape(-1)

        if len(scores) >= 2:
            sorted_scores = np.sort(scores)
            response["top_score"] = float(sorted_scores[-1])
            response["margin_gap"] = float(
                sorted_scores[-1] - sorted_scores[-2]
            )

    return response
