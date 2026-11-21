# WATERFARM-001 / Evercraft Aqua RC17 | Reliability review

**Status:** research code only; no production merge, infrastructure deployment, operator records or physical testing.

## Confirmed defects from RC16 review

**Offline upgrade safety.** In RC16 the activation event deleted older Aqua release caches after installing a new one, even though older tabs could still be relying on them. In RC17 the activation step verifies its own static cache but *does not remove previous release caches*. The worker still does not force waiting workers or claim active clients. On an exact allowlisted path, an unexpected cache miss returns an explicit 503 instead of fetching an unpinned/mismatched network asset. Old-cache cleanup must be a separately reviewed operation after device acceptance; persistent caches consume disk and can be evicted.

**Cumulative numeric precision.** RC16 parsed cumulative meters with JavaScript Number and subtracted floating-point readings, which can lose very small differences at large counts, or normalize away trailing displayed decimals. RC17 parses nonnegative fixed-point decimal strings with BigInt, a six-fractional-digit maximum, and rejects scaled integer values beyond Number.MAX_SAFE_INTEGER. Delta subtraction happens at the common exact integer scale before conversion. Meter input strings are preserved; a separate `total_source_withdrawal_unrounded_l`, daily `source_withdrawal_unrounded_l`, and `reporting_precision_hold` expose volumes that could otherwise round to zero at the original three-decimal display scale. These new fields do **not** imply physical measurement accuracy; device resolution and calibration must be independently verified.

## Evidence and acceptance

- Run automated Node tests, Python hosted verifier mocks, and injected-page Chromium scenarios. Do not call DOM injection actual HTTPS or WebKit acceptance.
- Before release, require exact SHA256 manifest/bytes and security headers on an *owner-controlled* HTTPS origin; no surprise new domain or deployment.
- On actual iPhone: verify Home Screen install, 15 synthetic readings, external backup export and import, offline force-quit/reopen, active-tab update behavior, and explicit cache integrity failure. Retain older release assets until active-client safety is demonstrated.
- Separately review privacy and encryption, site consent, source-meter calibration, daily timestamps and hydraulic boundary before admitting any real field data.
- No scientific causal or savings claim from a one-meter withdrawal baseline.

## Climate and film tracks

The previously archived 2024 Yakima NOAA station data remain the most recent complete year verified in this project. Missing/flagged source readings in other years must remain HOLD, not imputed. In this environment a new NOAA 2022–2023 daily-data retrieval was attempted via the official service but the full daily dataset could not be materialized or quality-verified. The live-action documentary master still lacks rights-cleared real camera footage. The WSU/SYCD introduction drafts remain unsent.

**Recommended next move:** owner-approved first-party staging path and independent iPhone acceptance, then a consented passive meter pilot. No first-party hosted release or real data has been proven in this change.
