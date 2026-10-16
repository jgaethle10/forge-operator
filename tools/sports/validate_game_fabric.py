"""Validate public-safe Game Fabric game records. Standard-library only.

Usage: python3 tools/sports/validate_game_fabric.py game_records.json
No network, publishing, or external contact is performed.
"""
import json
import sys
from datetime import datetime, timezone

REQUIRED = ("game_id", "sport", "level", "home_team", "away_team",
            "start_local", "timezone", "sources", "layers",
            "hypotheses", "counterexamples", "coach_questions",
            "film_sources", "postgame_checkpoints", "release")

def check_game(game):
    errors = []
    for field in REQUIRED:
        if field not in game:
            errors.append(f"missing {field}")
    if errors:
        return errors
    if not game["sources"]:
        errors.append("no schedule/score evidence")
    for i, source in enumerate(game["sources"]):
        for field in ("url", "publisher", "retrieved_at", "rights", "claim"):
            if not source.get(field):
                errors.append(f"source[{i}] missing {field}")
        if not str(source.get("url", "")).startswith("https://"):
            errors.append(f"source[{i}] requires HTTPS source URL")
    if len(game["hypotheses"]) < 2:
        errors.append("at least two competing hypotheses required")
    if not game["counterexamples"]:
        errors.append("meaningful counterexample required")
    if not game["coach_questions"] or not game["postgame_checkpoints"]:
        errors.append("coach questions and learning checkpoints required")
    layers = game["layers"]
    if not isinstance(layers, dict) or not all(k in layers for k in ("observed", "unmapped")):
        errors.append("layers must distinguish observed and unmapped")
    release = game["release"]
    for gate in ("systemia_admitted", "rights_privacy_cleared", "coaching_relevance_checked", "explicit_authorization"):
        if release.get(gate) is not True:
            errors.append(f"PUBLICATION BLOCKED: {gate}")
    if game.get("claims_authorized_film_viewed") and not game.get("authorized_film_receipt"):
        errors.append("film-view claim without authorization receipt")
    if game.get("private_minor_data") or game.get("restricted_video_content"):
        errors.append("restricted minor data or video prohibited")
    return errors

def main(path):
    with open(path, encoding="utf-8") as f:
        records = json.load(f)
    if not isinstance(records, list):
        raise ValueError("expected a JSON array")
    blocked = 0
    for game in records:
        errors = check_game(game)
        print(json.dumps({"game_id": game.get("game_id"), "ready_for_publication": not errors, "findings": errors}))
        blocked += bool(errors)
    print(f"QA: {len(records)} checked; {blocked} blocked; {len(records)-blocked} eligible by static gates (not published)")
    return 1 if blocked else 0

if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
