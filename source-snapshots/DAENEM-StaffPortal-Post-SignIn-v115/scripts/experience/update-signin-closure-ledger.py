#!/usr/bin/env python3
"""Preserve the historical ledger while adding the independent Sign-In correction layer."""

from __future__ import annotations

import csv
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
PATH = ROOT / "requirements-ledger.csv"
ADDED_COLUMNS = [
    "SITE_IMPLEMENTATION_STATUS",
    "PRODUCTION_IMPLEMENTATION_STATUS",
    "V16_PRIOR_RESULT",
    "INDEPENDENT_REVIEW_CORRECTION",
    "EVIDENCE_STATUS",
    "CURRENT_SOURCE_MARKER",
]

CORRECTION_ROWS = [
    ("V16-SIGNIN-001", "Owner reference baseline", "Sign-In", "PASS_VERIFIED", "V16 PASS was rejected by independent review; current shared runtime is implemented but awaits final exact-source visual evidence."),
    ("V16-SIGNIN-002", "Ten distinct structural art directions", "Sign-In Themes", "PASS_VERIFIED", "V16 source-presence evidence was insufficient; ten distinct layouts require final screenshot comparison."),
    ("V16-SIGNIN-005", "Purpose-built mobile composition", "Sign-In Responsive", "PASS_VERIFIED", "V16 mobile composition overflowed; V17 closure layout is implemented but final matrix is pending."),
    ("V16-SIGNIN-006", "Computed minimum visible typography", "Sign-In Accessibility", "PASS_VERIFIED", "V16 CSS-string evidence was invalid; computed-style inspection must include portal dialogs."),
    ("V16-BUILDER-001", "No-code builder lifecycle", "Sign-In Builder", "PASS_VERIFIED", "V16 controls were not connected end-to-end; full declarative lifecycle is now implemented and awaits browser behavior evidence."),
    ("V16-BUILDER-002", "Independent breakpoint layouts", "Sign-In Builder", "PASS_VERIFIED", "V16 did not persist independent layouts; four breakpoint objects now persist and await reload proof."),
    ("V16-BUILDER-003", "Drag, empty-cell placement, reorder and exact-widget resize", "Sign-In Builder", "PASS_VERIFIED", "V16 string checks were invalid; direct manipulation is implemented with collision guards and exact widget IDs."),
    ("V16-BUILDER-006", "Visual style controls affect shared runtime", "Sign-In Builder", "PASS_VERIFIED", "V16 style controls were partially decorative; all listed controls now update renderer tokens and await before/after browser proof."),
    ("V16-BUILDER-007", "Motion controls affect shared runtime", "Sign-In Builder", "PASS_VERIFIED", "V16 motion controls were incomplete; levels and Custom parameters now drive runtime attributes and await reduced-motion proof."),
    ("V16-BUILDER-008", "Theme lifecycle", "Sign-In Builder", "PASS_VERIFIED", "V16 lifecycle was not behaviorally verified; create, clone, variant, review, local publish, compare, rollback, restore, archive and import/export are implemented."),
    ("V17-CLOSURE-001", "Initial Sign-In has zero internal scroll", "Sign-In Responsive", "FAIL", "V17 observed one-pixel internal overflow; stage-specific sizing is implemented and awaits exact final-source matrix."),
    ("V17-CLOSURE-002", "Global Time contains exactly six international cities and excludes Ibadan", "Sign-In Clocks", "PASS_VERIFIED", "Source correction is present; PASS_VERIFIED requires final runtime assertion."),
    ("V17-CLOSURE-003", "Typed functional public-safe widget registry", "Sign-In Builder", "FAIL", "V17 generic placeholder behavior was rejected; registry now maps each enabled capability to a typed renderer and schema."),
    ("V17-CLOSURE-004", "Widget-specific settings", "Sign-In Builder", "FAIL", "V17 generic settings were incomplete; capability-specific safe schemas and renderer settings are implemented."),
    ("V17-CLOSURE-005", "Group interaction moves members and supports ungroup", "Sign-In Builder", "FAIL", "V17 grouping metadata alone was rejected; grouped member movement and visible group selection are implemented."),
    ("V17-CLOSURE-006", "Draft, clone and variant selection survive reload", "Sign-In Builder", "FAIL", "V17 could lose the active custom draft; builder theme ID persistence is implemented."),
    ("V17-CLOSURE-007", "Canonical imports retain all mandatory capabilities", "Sign-In Security", "FAIL", "V17 only guaranteed Authentication; imports now reject missing canonical capabilities and restricted widgets."),
    ("V17-CLOSURE-008", "Scheduling is truthfully classified", "Sign-In Builder", "PARTIAL", "Automatic activation is disabled and labelled PRODUCTION_INTEGRATION_PENDING; local intent storage is Site-implemented."),
    ("V17-CLOSURE-009", "Exact-source 70-row browser matrix", "Sign-In Evidence", "FAIL", "The V16 matrix is stale and cannot count; final-source browser evidence has not yet been generated."),
    ("V17-CLOSURE-010", "Twenty exact-source theme screenshots plus representative viewports", "Sign-In Evidence", "FAIL", "No earlier or loading-state screenshots count; final-source visual capture remains pending."),
]


def is_signin_row(row: dict[str, str]) -> bool:
    text = " ".join(
        row.get(key, "")
        for key in ("DOMAIN", "REQUIREMENT", "ROUTE", "COMPONENT", "TEST_ID")
    ).lower()
    return any(token in text for token in ("sign-in", "signin", "authentication", "create account", "password recovery", "world clock", "current weather"))


with PATH.open(newline="", encoding="utf-8-sig") as handle:
    reader = csv.DictReader(handle)
    original_fields = list(reader.fieldnames or [])
    rows = list(reader)

fields = original_fields + [field for field in ADDED_COLUMNS if field not in original_fields]

for row in rows:
    for field in fields:
        row.setdefault(field, "")
    row["PRODUCTION_IMPLEMENTATION_STATUS"] = row["PRODUCTION_IMPLEMENTATION_STATUS"] or (
        "BLOCKED_PRODUCTION" if row.get("SITE_OR_PRODUCTION") == "PRODUCTION" else "NOT_ASSESSED_IN_SIGNIN_SPRINT"
    )
    if is_signin_row(row):
        prior = row.get("STATUS", "")
        row["V16_PRIOR_RESULT"] = row["V16_PRIOR_RESULT"] or prior
        row["SITE_IMPLEMENTATION_STATUS"] = "IMPLEMENTED_UNVERIFIED" if prior not in {"NOT_APPLICABLE", "BLOCKED_PRODUCTION"} else prior
        row["INDEPENDENT_REVIEW_CORRECTION"] = "V16/V17 status is not carried forward as verified without exact-source browser or specific functional evidence."
        row["EVIDENCE_STATUS"] = "FINAL_EXACT_SOURCE_BROWSER_EVIDENCE_PENDING"
        row["CURRENT_SOURCE_MARKER"] = "SIGNIN_CLOSURE_SOURCE_PENDING_FINAL_COMMIT"
    else:
        row["SITE_IMPLEMENTATION_STATUS"] = row["SITE_IMPLEMENTATION_STATUS"] or "OUT_OF_SCOPE_PRESERVED"
        row["EVIDENCE_STATUS"] = row["EVIDENCE_STATUS"] or "NOT_REASSESSED_IN_SIGNIN_SPRINT"

existing_ids = {row.get("REQUIREMENT_ID") for row in rows}
for requirement_id, requirement, domain, prior, correction in CORRECTION_ROWS:
    if requirement_id in existing_ids:
        continue
    row = {field: "" for field in fields}
    row.update(
        {
            "REQUIREMENT_ID": requirement_id,
            "SOURCE": "V17_INDEPENDENT_ACCEPTANCE_CORRECTION_AND_SIGNIN_CLOSURE_SPRINT",
            "DOMAIN": domain,
            "REQUIREMENT": requirement,
            "BUSINESS_REASON": "Independent Owner acceptance and trustworthy product completion",
            "SECURITY_RULE": "PUBLIC_SAFE pre-authentication; assigned access remains undisclosed",
            "FIRST_REQUESTED_VERSION": "V16" if requirement_id.startswith("V16-") else "V17",
            "FIRST_IMPLEMENTED_VERSION": "V17_CLOSURE_WORKTREE",
            "LAST_VERIFIED_VERSION": "",
            "STATUS": "IMPLEMENTED_UNVERIFIED",
            "SITE_OR_PRODUCTION": "SITE",
            "ROUTE": "/signin or /signin-design",
            "COMPONENT": "SignInRuntimeRenderer / SignInExperienceBuilder",
            "TEST_ID": requirement_id,
            "EVIDENCE": "Final exact-source browser evidence pending",
            "REGRESSION": "NO SOURCE REGRESSION OBSERVED",
            "REMAINING_GAP": "Exact-source browser behavior and visual acceptance",
            "NEXT_ACTION": "Run final matrix and evidence capture from frozen saved source",
            "VERIFICATION_METHOD": "Runtime browser interaction and computed layout/style inspection",
            "VERIFICATION_ARTIFACT": "final-signin-browser-matrix.csv / signin-builder-behavior-results.json",
            "SOURCE_LOCATION": "app/experience/signin-theme-runtime.tsx; app/experience/signin-widget-registry.tsx; app/experience/signin-builder-v16.tsx",
            "TEST_ASSERTION": "Specific requirement assertion; no generic grouped pass",
            "VISUAL_EVIDENCE": "Pending exact-source screenshots",
            "LAST_ACTUALLY_VERIFIED_AT": "",
            "SITE_IMPLEMENTATION_STATUS": "IMPLEMENTED_UNVERIFIED",
            "PRODUCTION_IMPLEMENTATION_STATUS": "BLOCKED_PRODUCTION" if requirement_id == "V17-CLOSURE-008" else "NO_PRODUCTION_CHANGE_REQUIRED",
            "V16_PRIOR_RESULT": prior,
            "INDEPENDENT_REVIEW_CORRECTION": correction,
            "EVIDENCE_STATUS": "FINAL_EXACT_SOURCE_BROWSER_EVIDENCE_PENDING",
            "CURRENT_SOURCE_MARKER": "SIGNIN_CLOSURE_SOURCE_PENDING_FINAL_COMMIT",
        }
    )
    rows.append(row)

temporary = PATH.with_suffix(".csv.tmp")
with temporary.open("w", newline="", encoding="utf-8") as handle:
    writer = csv.DictWriter(handle, fieldnames=fields, lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
temporary.replace(PATH)

print(f"Updated {PATH.name}: {len(rows)} rows, {len(fields)} columns")
