import argparse
import json
from pathlib import Path

from model import InvoiceFeatures, ModelBundle


def main():
    parser = argparse.ArgumentParser(description="Train an offline InvoiceIQ Isolation Forest artifact")
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=Path("artifacts/isolation-forest.joblib"))
    parser.add_argument("--contamination", type=float, default=0.02)
    parser.add_argument("--trees", type=int, default=200)
    parser.add_argument("--seed", type=int, default=42)
    arguments = parser.parse_args()
    payload = json.loads(arguments.input.read_text(encoding="utf-8"))
    rows = [InvoiceFeatures.model_validate(row) for row in payload["features"]]
    bundle = ModelBundle.train(rows, arguments.contamination, arguments.trees, arguments.seed)
    bundle.save(arguments.output)
    print(json.dumps({"model_version": bundle.version, "training_rows": len(rows), "threshold": float(bundle.forest.offset_)}))


if __name__ == "__main__":
    main()