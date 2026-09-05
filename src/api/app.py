from pathlib import Path

import joblib
import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from src.data.preprocess import clean_text
from src.routing.store import category_counts, list_articles, route_article

ROOT = Path(__file__).resolve().parents[2]
WEB_DIR = ROOT / "web"
MODEL_DIR = ROOT / "models"

app = FastAPI(title="News Classification Editor Desk", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

model = joblib.load(MODEL_DIR / "news_model.pkl")
vectorizer = joblib.load(MODEL_DIR / "tfidf_vectorizer.pkl")
CATEGORIES = [str(label) for label in model.classes_]
LOW_CONFIDENCE = 0.50


class Article(BaseModel):
    text: str = Field(..., min_length=1)
    headline: str = ""


def _probabilities(features) -> dict[str, float]:
    scores = np.asarray(model.decision_function(features), dtype=float).ravel()
    shifted = scores - scores.max()
    exp = np.exp(shifted)
    probs = exp / exp.sum()
    return {label: float(prob) for label, prob in zip(CATEGORIES, probs)}


@app.get("/api/health")
def health():
    return {"status": "ok", "categories": CATEGORIES}


@app.get("/api/categories")
def categories():
    counts = category_counts()
    return {
        "categories": CATEGORIES,
        "counts": {name: counts.get(name, 0) for name in CATEGORIES},
        "total": sum(counts.values()),
    }


@app.get("/api/feeds")
def feeds(category: str | None = None):
    if category and category not in CATEGORIES:
        raise HTTPException(status_code=404, detail="Unknown category")
    items = list_articles(category)
    return {"items": items, "count": len(items)}


@app.post("/predict")
@app.post("/api/predict")
def predict(article: Article):
    body = article.text.strip()
    headline = article.headline.strip()
    if not body:
        raise HTTPException(status_code=400, detail="News article text is required")

    combined = f"{headline} {body}".strip()
    features = vectorizer.transform([clean_text(combined)])
    category = str(model.predict(features)[0])
    scores = _probabilities(features)
    confidence = scores[category]
    routed = route_article(
        text=body,
        category=category,
        headline=headline,
        confidence=confidence,
    )

    ranked = sorted(scores.items(), key=lambda item: item[1], reverse=True)
    return {
        "category": category,
        "confidence": round(confidence, 4),
        "low_confidence": confidence < LOW_CONFIDENCE,
        "scores": {name: round(value, 4) for name, value in scores.items()},
        "top": [{"category": name, "confidence": round(value, 4)} for name, value in ranked],
        "routed": routed,
    }


@app.get("/")
def index():
    return FileResponse(WEB_DIR / "index.html")


app.mount("/static", StaticFiles(directory=WEB_DIR), name="static")
