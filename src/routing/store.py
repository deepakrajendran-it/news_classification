import csv
import os
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FEED_DIR = ROOT / "data" / "feeds"

FIELDNAMES = ["timestamp", "category", "headline", "text", "confidence"]


def _feed_path(category: str) -> Path:
    safe = "".join(ch for ch in category.lower() if ch.isalnum() or ch in "-_")
    return FEED_DIR / f"{safe}.csv"


def _read_rows(path: Path) -> list[dict]:
    if not path.exists():
        return []

    with path.open("r", newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        rows = []
        for row in reader:
            rows.append(
                {
                    "timestamp": row.get("timestamp", ""),
                    "category": row.get("category", path.stem),
                    "headline": row.get("headline", "") or "",
                    "text": row.get("text", "") or "",
                    "confidence": row.get("confidence", "") or "",
                }
            )
        return rows


def _write_rows(path: Path, rows: list[dict]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDNAMES)
        writer.writeheader()
        for row in rows:
            writer.writerow({key: row.get(key, "") for key in FIELDNAMES})


def route_article(text: str, category: str, headline: str = "", confidence: float | None = None) -> dict:
    os.makedirs(FEED_DIR, exist_ok=True)
    path = _feed_path(category)
    rows = _read_rows(path)

    record = {
        "timestamp": datetime.now().isoformat(timespec="seconds"),
        "category": category,
        "headline": (headline or "").strip(),
        "text": text,
        "confidence": "" if confidence is None else f"{float(confidence):.4f}",
    }
    rows.append(record)
    _write_rows(path, rows)
    return record


def list_articles(category: str | None = None) -> list[dict]:
    os.makedirs(FEED_DIR, exist_ok=True)
    articles: list[dict] = []

    paths = [_feed_path(category)] if category else sorted(FEED_DIR.glob("*.csv"))
    for path in paths:
        if not path.exists():
            continue
        for row in _read_rows(path):
            confidence_raw = row.get("confidence") or ""
            try:
                confidence = float(confidence_raw) if confidence_raw != "" else None
            except ValueError:
                confidence = None
            articles.append(
                {
                    "timestamp": row["timestamp"],
                    "category": row["category"] or path.stem,
                    "headline": row["headline"],
                    "text": row["text"],
                    "confidence": confidence,
                }
            )

    articles.sort(key=lambda item: item["timestamp"], reverse=True)
    return articles


def category_counts() -> dict[str, int]:
    counts: dict[str, int] = {}
    for article in list_articles():
        key = article["category"]
        counts[key] = counts.get(key, 0) + 1
    return counts
