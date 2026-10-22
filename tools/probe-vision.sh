#!/usr/bin/env bash
# Why the reader is not a model.
#
# Feeds a page image to a local vision model with a strict JSON prompt and
# prints what comes back. Run it against a page you already know the answer for;
# the point is how often the answer is wrong in a way that still looks like JSON.
#
#   ./tools/probe-vision.sh page.png            # default gemma3:4b
#   MODEL=gemma3:1b ./tools/probe-vision.sh page.png
set -euo pipefail

IMG="${1:?usage: probe-vision.sh <page.png>}"
MODEL="${MODEL:-gemma3:4b}"
OUT="$(mktemp -t probe-vision-XXXXXX.json)"

request="$(python3 - "$IMG" "$MODEL" <<'PY'
import base64, json, sys

path, model = sys.argv[1], sys.argv[2]
print(json.dumps({
    "model": model,
    "prompt": (
        "Read this document image. Reply with JSON only, no prose: "
        '{"surname":"","given_names":"","dob":"","passport_no":"","expiry":"","address":""}'
    ),
    "images": [base64.b64encode(open(path, "rb").read()).decode()],
    "stream": False,
    "options": {"temperature": 0, "num_predict": 220, "num_ctx": 2048},
}))
PY
)"

echo "model: $MODEL"
time curl -s http://localhost:11434/api/generate -d "$request" -o "$OUT"

python3 - "$OUT" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
print(d.get("response", "")[:600])
print("eval_count", d.get("eval_count"))
PY
rm -f "$OUT"
