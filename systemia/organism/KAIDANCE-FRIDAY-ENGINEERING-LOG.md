# Friday engineering log

This readout extends [Systemia aerospace continuity #2213](https://github.com/jgaethle10/forge-operator/issues/2213). The existing resident company heartbeat checks for the first pulse at or after 09:00 America/Los_Angeles each Friday. An owned runtime that misses all Friday pulses skips that week's review.

After deploying the reviewed source through the existing owned Systemia release path, set `SYSTEMIA_KAIDANCE_FRIDAY_ENGINEERING_LOG=true` in the active resident heartbeat environment. GitHub Actions runs leave the lane disabled. Public GitHub records work without credentials. An optional existing read-only credential can be supplied as `SYSTEMIA_KAIDANCE_ENGINEERING_LOG_GITHUB_TOKEN`.

The heartbeat emits a status in `friday_engineering_log`. A compiled report is stored under `kaidance-friday-engineering-log/YYYY-MM-DD.json`, a private sibling of the company heartbeat output directory. Review the date, source coverage, exact links and simulation output before admitting the report to the portfolio registry. Each log has its own filename and is retained across later weeks. A partial report explicitly identifies unavailable sources.

Add or retire selected GitHub sources through the `programs` list in `kaidance-friday-engineering-log.mjs` after reconciling with mission #2213. Tracking and PR records provide context and source status. The included EarthWorks run provides a separate local software simulation receipt with input hashes and test output. It does not grant any actuation, release or registry write authority.

Run `node --test tests/kaidance-friday-engineering-log.test.mjs systemia/earthworks-autonomy/fleet-controller.test.mjs` for the scheduling and compilation proof plus the EarthWorks simulation suite.
