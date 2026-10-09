import hashlib
import json
import os
from pathlib import Path
from typing import Annotated

import joblib
import numpy as np
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sklearn.ensemble import IsolationForest
from sklearn.impute import SimpleImputer


FEATURE_NAMES = [
    "amount_usd", "vendor_avg_usd", "processing_days", "ocr_confidence",
    "supplier_exception_rate", "ocr_missing", "vendor_baseline_missing",
]
NonNegative = Annotated[float, Field(ge=0)]
Fraction = Annotated[float, Field(ge=0, le=1)]


class InvoiceFeatures(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False, strict=True)
    invoice_id: str = Field(min_length=1)
    amount_usd: NonNegative
    vendor_avg_usd: NonNegative | None
    processing_days: NonNegative
    ocr_confidence: Fraction | None
    supplier_exception_rate: Fraction


class ScoreRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    features: list[InvoiceFeatures] = Field(min_length=1, max_length=1000)

    @model_validator(mode="after")
    def unique_invoices(self):
        identifiers = [row.invoice_id for row in self.features]
        if len(set(identifiers)) != len(identifiers):
            raise ValueError("Each invoice_id must occur only once in a score batch")
        return self


class ScoreResult(BaseModel):
    invoice_id: str
    score: float
    is_outlier: bool


class ScoreResponse(BaseModel):
    model_version: str
    threshold: float
    training_row_count: int
    results: list[ScoreResult]


def feature_matrix(rows: list[InvoiceFeatures]):
    return np.asarray([
        [row.amount_usd, row.vendor_avg_usd if row.vendor_avg_usd is not None else np.nan,
         row.processing_days, row.ocr_confidence if row.ocr_confidence is not None else np.nan,
         row.supplier_exception_rate, float(row.ocr_confidence is None), float(row.vendor_avg_usd is None)]
        for row in rows
    ], dtype=np.float64)


class ModelBundle:
    def __init__(self, imputer, forest, version, training_row_count):
        self.imputer = imputer
        self.forest = forest
        self.version = version
        self.training_row_count = training_row_count

    @classmethod
    def train(cls, rows: list[InvoiceFeatures], contamination=0.02, trees=200, seed=42):
        if len(rows) < 20:
            raise ValueError("At least 20 representative training invoices are required")
        if len({row.invoice_id for row in rows}) != len(rows):
            raise ValueError("Training invoice IDs must be unique")
        if not 0 < contamination <= 0.5 or trees < 1:
            raise ValueError("Contamination must be in (0, 0.5] and tree count must be positive")
        ordered = sorted(rows, key=lambda row: row.invoice_id)
        imputer = SimpleImputer(strategy="median", keep_empty_features=True)
        matrix = imputer.fit_transform(feature_matrix(ordered))
        forest = IsolationForest(n_estimators=trees, contamination=contamination, random_state=seed, n_jobs=1)
        forest.fit(matrix)
        signature = json.dumps({
            "features": FEATURE_NAMES, "rows": [row.model_dump() for row in ordered],
            "contamination": contamination, "trees": trees, "seed": seed,
            "pipeline": "median-imputer-isolation-forest-v1",
        }, sort_keys=True, allow_nan=False).encode()
        version = "iforest-v1-" + hashlib.sha256(signature).hexdigest()[:16]
        return cls(imputer, forest, version, len(rows))

    def score(self, rows: list[InvoiceFeatures]):
        scores = self.forest.score_samples(self.imputer.transform(feature_matrix(rows)))
        threshold = float(self.forest.offset_)
        if not np.all(np.isfinite(scores)):
            raise ValueError("Model produced non-finite scores")
        return ScoreResponse(
            model_version=self.version,
            threshold=threshold,
            training_row_count=self.training_row_count,
            results=[ScoreResult(invoice_id=row.invoice_id, score=float(score), is_outlier=bool(score < threshold))
                     for row, score in zip(rows, scores, strict=True)],
        )

    def save(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_suffix(".tmp")
        joblib.dump({"feature_names": FEATURE_NAMES, "bundle": self}, temporary)
        os.replace(temporary, path)

    @classmethod
    def load(cls, path: Path):
        artifact = joblib.load(path)
        if artifact.get("feature_names") != FEATURE_NAMES or not isinstance(artifact.get("bundle"), cls):
            raise ValueError("Incompatible model artifact")
        return artifact["bundle"]