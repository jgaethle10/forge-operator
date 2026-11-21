"""Check real-data SuperCon benchmark answer reports and reject wrong answers.

Uses observed UCI data derived receipts, never synthetic scientific source data.
This does not establish expert review, frontier-model failure, or paid acceptance.
"""
import argparse
import copy
import json
import math
from pathlib import Path

SHA = "87f4490d73390ff94ee01dbf0d7d32abc80b22f2c803d471765cfc46a9f6371e"


class InvalidSubmission(ValueError):
    pass


def require(condition, message):
    if not condition:
        raise InvalidSubmission(message)


def check_number(value, expected, label):
    require(type(value) in (int, float) and math.isfinite(value), f"{label}: not finite number")
    require(math.isclose(value, expected, rel_tol=1e-8, abs_tol=1e-8), f"{label}: incorrect")


def check_int(value, expected, label):
    require(type(value) is int and value == expected, f"{label}: incorrect integer")


def verify(audit, split):
    require(isinstance(audit, dict) and isinstance(split, dict), "JSON objects required")
    require(audit.get("schema") == "evercraft.supercon.observed.v1", "audit schema")
    require(split.get("schema") == "evercraft.supercon.split-integrity.v1", "split schema")
    for label, report in (("audit", audit), ("split", split)):
        require(report.get("source_sha256") == SHA, f"{label}: source checksum mismatch")
        require(report.get("synthetic_task_data_used") is False, f"{label}: synthetic source prohibited")
        require(report.get("license") == "CC BY 4.0", f"{label}: attribution")
        require(report.get("frontier_model_failures_verified") is not True, "unverified frontier model claim")
        require(report.get("paid_task_accepted") is not True, "unverified acceptance claim")
    for key, value in {
        "n_rows": 21263, "n_distinct_compositions": 15164,
        "n_repeated_compositions": 2422, "n_discordant_compositions": 2375,
        "n_rows_in_discordant_compositions": 8427,
    }.items():
        check_int(audit.get(key), value, key)
    check_number(audit.get("best_in_sample_composition_only_RMSE_K"), 4.302818789840542, "RMSE")
    check_number(audit.get("max_recorded_Tc_disagreement_K"), 125.0, "Tc range")
    require(audit.get("independent_SSE_passed") is True, "independent SSE")
    check_int(split.get("random_seed"), 20261029, "random seed")
    check_int(split.get("n_original_rows"), 21263, "split rows")
    check_int(split.get("n_composition_groups"), 15164, "split groups")
    require(split.get("independent_overlap_verification_passed") is True, "independent overlap")
    for label, key, overlaps, leakage in (
        ("random", "random_row_split", 1065, 1556),
        ("group", "composition_group_split", 0, 0),
    ):
        part = split.get(key)
        require(isinstance(part, dict), f"{label}: missing section")
        check_int(part.get("train_rows"), 17010, f"{label} train")
        check_int(part.get("test_rows"), 4253, f"{label} test")
        check_int(part.get("overlapping_compositions"), overlaps, f"{label} overlaps")
        check_int(part.get("test_rows_with_exact_composition_in_train"), leakage, f"{label} leakage rows")
        check_number(part.get("test_row_leakage_fraction"), leakage / 4253, f"{label} leakage rate")
    check_number(split.get("random_split_simple_composition_memorizer_rmse_K"),
                 27.41527628432069, "memorizer RMSE")


def test_negative(audit, split):
    invalid = []
    def wrong_a(key, value):
        a, s = copy.deepcopy(audit), copy.deepcopy(split)
        a[key] = value
        invalid.append((key, a, s))
    def wrong_s(section, key, value):
        a, s = copy.deepcopy(audit), copy.deepcopy(split)
        (s[section] if section else s)[key] = value
        invalid.append((key, a, s))
    wrong_a("source_sha256", "bad-hash")
    wrong_s(None, "synthetic_task_data_used", True)
    wrong_a("n_repeated_compositions", 0)
    wrong_a("best_in_sample_composition_only_RMSE_K", 0.0)
    wrong_s("composition_group_split", "overlapping_compositions", 1)
    wrong_s("random_row_split", "test_rows_with_exact_composition_in_train", 0)
    wrong_s("random_row_split", "test_row_leakage_fraction", 0.0)
    wrong_s(None, "frontier_model_failures_verified", True)
    wrong_a("paid_task_accepted", True)
    for name, a, s in invalid:
        try:
            verify(a, s)
        except InvalidSubmission:
            continue
        raise AssertionError(f"Invalid answer accepted by verifier: {name}")
    return len(invalid)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--audit", type=Path, default=Path("supercon_audit_receipt.json"))
    p.add_argument("--split", type=Path, default=Path("supercon_split_receipt.json"))
    p.add_argument("--self-test", action="store_true")
    args = p.parse_args()
    audit = json.loads(args.audit.read_text())
    split = json.loads(args.split.read_text())
    verify(audit, split)
    n = test_negative(audit, split) if args.self_test else 0
    print(json.dumps({
        "observational_source": True, "valid_observed_receipts": True,
        "invalid_answers_rejected": n, "scientific_expert_review_completed": False,
        "frontier_models_tested": False, "paid_task_accepted": False
    }, indent=2))


if __name__ == "__main__":
    main()
