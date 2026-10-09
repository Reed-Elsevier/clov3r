import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import unittest
from urllib.parse import unquote, urlsplit


ENTRYPOINT = Path(__file__).resolve().parents[1] / "ecs" / "anomaly-entrypoint.py"
SPECIFICATION = importlib.util.spec_from_file_location("anomaly_entrypoint", ENTRYPOINT)
ENTRYPOINT_MODULE = importlib.util.module_from_spec(SPECIFICATION)
SPECIFICATION.loader.exec_module(ENTRYPOINT_MODULE)


class EntrypointTests(unittest.TestCase):
    def test_url_encoding_and_secret_removal(self):
        password = "test@:/?#%[] secret"
        environment = {
            "DB_CREDENTIALS": json.dumps({"username": "invoiceiq_admin", "password": password}),
            "DB_HOST": "db.example.internal",
            "DB_NAME": "invoiceiq",
            "ANOMALY_ENGINE_URL": "http://anomaly-engine.invoiceiq-dev.internal:8000",
            "BEDROCK_MODEL_ID": "test-model",
        }
        result = ENTRYPOINT_MODULE.build_environment(environment)
        parsed = urlsplit(result["DATABASE_URL"])
        self.assertEqual(unquote(parsed.password), password)
        self.assertEqual(parsed.username, "invoiceiq_admin")
        self.assertEqual(parsed.hostname, environment["DB_HOST"])
        self.assertEqual(parsed.port, 5432)
        self.assertEqual(parsed.path, "/invoiceiq")
        self.assertEqual(parsed.query, "sslmode=require")
        self.assertEqual(result["ANOMALY_ENGINE_URL"], environment["ANOMALY_ENGINE_URL"])
        self.assertEqual(result["BEDROCK_MODEL_ID"], "test-model")
        self.assertNotIn("DB_CREDENTIALS", result)
        self.assertIn("DB_CREDENTIALS", environment)

    def test_malformed_secret_does_not_leak(self):
        result = subprocess.run(
            [sys.executable, "-B", str(ENTRYPOINT)],
            env={"DB_CREDENTIALS": "not-json-test-secret"},
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, 1)
        self.assertIn("Unable to initialize database settings", result.stderr)
        self.assertNotIn("not-json-test-secret", result.stderr)

    def test_missing_fields_rejected(self):
        with self.assertRaises(KeyError):
            ENTRYPOINT_MODULE.build_environment({"DB_CREDENTIALS": "{}"})


if __name__ == "__main__":
    unittest.main()