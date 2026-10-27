#!/usr/bin/env python3
"""Apply a trusted figure watchlist snapshot submitted through a GitHub Issue."""
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PREFIX = "FIGURE_TRACKER_SET_V1"
MARKER = r"<!--\s*FIGURE_TRACKER_STATE_V1\s*(\{[^\r\n]*\})\s*-->"

def run():
    event_file = os.environ.get("GITHUB_EVENT_PATH")
    if not event_file:
        raise RuntimeError("GITHUB_EVENT_PATH is required")
    event = json.loads(Path(event_file).read_text(encoding="utf-8"))
    issue = event["issue"]
    if issue["user"]["login"].lower() != "svl33333" or issue["title"] != PREFIX:
        raise RuntimeError("Untrusted issue or invalid title")
    matched = re.search(MARKER, issue.get("body") or "")
    if not matched:
        raise ValueError("The issue must contain one FIGURE_TRACKER_STATE_V1 JSON marker")
    payload = json.loads(matched.group(1))
    if not isinstance(payload, dict) or set(payload) != {"ignored_ids"}:
        raise ValueError("Payload must contain ignored_ids only")
    selected = payload["ignored_ids"]
    if not isinstance(selected, list) or len(selected) > 300:
        raise ValueError("ignored_ids must be a bounded array")
    entries = json.loads((ROOT / "items.json").read_text(encoding="utf-8"))
    allowed = {row["id"] for row in entries}
    if any(type(x) is not int or x not in allowed for x in selected):
        raise ValueError("Unknown or invalid product id")
    number = issue["number"]
    if type(number) is not int or number <= 0:
        raise ValueError("Invalid issue number")
    statefile = ROOT / "tracking.json"
    current = json.loads(statefile.read_text(encoding="utf-8"))
    previous = current.get("source_issue_number", 0)
    if number <= previous:
        print(f"Skipping older issue #{number}; last applied is #{previous}")
        return
    state = {
        "schema_version": 1,
        "ignored_ids": sorted(set(selected)),
        "source_issue_number": number,
        "updated_at_utc": issue.get("created_at"),
    }
    statefile.write_text(
        json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"Applied issue #{number}; kept {len(allowed)-len(state['ignored_ids'])}, ignored {len(state['ignored_ids'])}")

if __name__ == "__main__":
    run()
