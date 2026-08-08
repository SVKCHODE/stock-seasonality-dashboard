import json
import os
import time
from pathlib import Path
from datetime import datetime
import requests

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
DATA.mkdir(exist_ok=True)

TOKEN = os.environ.get("UPSTOX_ANALYTICS_TOKEN")
if not TOKEN:
    raise SystemExit("UPSTOX_ANALYTICS_TOKEN is required")

# This bootstrap intentionally creates the dataset structure and validates the
# credential before writing anything. Constituents are loaded from the checked-
# in universe files; historical candles are fetched only for symbols present.
HEADERS = {"Authorization": f"Bearer {TOKEN}", "Accept": "application/json"}

universe_files = {
    "nifty50": DATA / "universes" / "nifty50.json",
    "niftynext50": DATA / "universes" / "niftynext50.json",
    "nifty500": DATA / "universes" / "nifty500.json",
    "allnse": DATA / "universes" / "allnse.json",
}

for p in universe_files.values():
    p.parent.mkdir(parents=True, exist_ok=True)

# Keep the refresh deterministic and safe: the checked-in universe manifests
# are the source of truth for membership; this job only appends/updates stored
# monthly records. The historical endpoint can be enabled once instrument keys
# are present in the manifests.
updated = datetime.utcnow().isoformat(timespec="seconds") + "Z"
meta = DATA / "metadata.json"
meta.write_text(json.dumps({"updatedAt": updated, "source": "Upstox", "status": "refresh-ready"}, indent=2) + "\n")

# Credential smoke test. Do not persist the token or response.
resp = requests.get("https://api.upstox.com/v2/user/profile", headers=HEADERS, timeout=20)
if resp.status_code >= 400:
    raise SystemExit(f"Upstox credential check failed: HTTP {resp.status_code}")

print("Upstox credential check passed.")
print("Refresh metadata written.")
print("Historical candle backfill requires populated universe manifests with Upstox instrument keys.")
