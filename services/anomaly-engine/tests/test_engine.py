from pathlib import Path
import random
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient
from main import create_app
from model import InvoiceFeatures, ModelBundle


def training_rows():
    generator = random.Random(42)
    return [InvoiceFeatures(
        invoice_id=f"SYNTHETIC-{index}", amount_usd=generator.gauss(1000, 50),
        vendor_avg_usd=generator.gauss(1000, 30) if index % 7 else None,
        processing_days=max(0, generator.gauss(5, 0.5)),
        ocr_confidence=min(1, max(0, generator.gauss(0.97, 0.01))) if index % 3 else None,
        supplier_exception_rate=min(1, max(0, generator.gauss(0.1, 0.01))),
    ) for index in range(200)]


class EngineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rows = training_rows()
        cls.bundle = ModelBundle.train(cls.rows, contamination=0.05, trees=100)

    def test_extreme_synthetic_probe_is_flagged_and_scores_are_bounded(self):
        probe = InvoiceFeatures(invoice_id="SYNTHETIC-PROBE", amount_usd=1_000_000,
                                vendor_avg_usd=1000, processing_days=365, ocr_confidence=0.01,
                                supplier_exception_rate=0.9)
        response = self.bundle.score([self.rows[10], probe])
        self.assertTrue(response.results[1].is_outlier)
        self.assertLess(response.results[1].score, response.results[0].score)
        self.assertTrue(all(-1 <= result.score <= 0 for result in response.results))

    def test_training_is_deterministic_and_artifact_round_trip_preserves_scores(self):
        repeated = ModelBundle.train(list(reversed(self.rows)), contamination=0.05, trees=100)
        self.assertEqual(repeated.version, self.bundle.version)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "model.joblib"
            self.bundle.save(path)
            self.assertEqual(ModelBundle.load(path).score(self.rows[:3]), self.bundle.score(self.rows[:3]))

    def test_missing_ocr_and_all_missing_baselines_do_not_change_feature_shape(self):
        rows = [row.model_copy(update={"ocr_confidence": None, "vendor_avg_usd": None}) for row in self.rows]
        bundle = ModelBundle.train(rows, trees=25)
        self.assertEqual(len(bundle.score(rows[:2]).results), 2)

    def test_api_scores_without_retraining_and_validates_input(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "model.joblib"
            self.bundle.save(path)
            with TestClient(create_app(path)) as client:
                self.assertEqual(client.get("/health").status_code, 200)
                self.assertEqual(client.get("/ready").status_code, 200)
                payload = {"features": [self.rows[0].model_dump()]}
                response = client.post("/score", json=payload)
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json()["model_version"], self.bundle.version)
                for invalid in [[], [self.rows[0].model_dump()] * 2, [{**self.rows[0].model_dump(), "amount_usd": -1}], [{**self.rows[0].model_dump(), "ocr_confidence": 2}]]:
                    self.assertEqual(client.post("/score", json={"features": invalid}).status_code, 422)

    def test_untrained_service_returns_503_instead_of_fitting_each_request(self):
        with TestClient(create_app("nonexistent-synthetic-test.joblib")) as client:
            self.assertEqual(client.get("/health").status_code, 200)
            self.assertEqual(client.get("/ready").status_code, 503)
            self.assertEqual(client.post("/score", json={"features": [self.rows[0].model_dump()]}).status_code, 503)

    def test_small_training_sets_are_rejected(self):
        with self.assertRaises(ValueError):
            ModelBundle.train(self.rows[:3])


if __name__ == "__main__":
    unittest.main()