# Evercraft LIVE RC07 | Real work, camera first

**Public route after approved merge and independently verified Pages deployment:** `/forge-operator/live/`.

The founder's Oct 18 phone recording exposed a bad viewing hierarchy: working EarthWorks motion and modeled production numbers were buried in a phone-sized nested control panel. RC07 removes the marketing hero and makes the actual application the program.

## What plays
- **Primary auto scene:** the real EarthWorks Live Yard controller in its opt-in `?studio=1` renderer. It copies pixels from the canonical 1100x620 simulated jobsite canvas and reads production, cycles, queue and loader metrics from `controller.snapshot()` and `stateMetrics()`; portrait framing pans among the *same scene's actual regions*. The fleet, conditions, measurements and activity are synthetic, not a physical quarry.
- **Secondary auto scene:** the already-published Washington volcano visual produced using cited USGS information. Not live environmental monitoring.
- **Manual doorways:** public EarthWorks Toy Yard, EPS cost estimator and HVAC lead prototype, all honestly labeled. Forms are not forced into the unattended rotation.

## Recording and operator controls
1. Open the PUBLIC route in a real browser, not an HTML attachment preview.
2. The first active scene should immediately occupy most of the viewport.
3. **Film** removes operator controls and retains a minimal truth disclosure. A visible **Exit film** button works on touch screens; Escape also exits on desktop.
4. **9:16** restricts framing for portrait capture where device dimensions allow it.
5. **Doorways** lets you inspect any of the five first-party public artifacts; selecting a manual door pauses rotation. **Hold scene** pauses scene changes, not the running simulation. **Next** changes exhibits.

## Hard boundaries
- Public website being continuously available is NOT a 24/7 TikTok/RTMP broadcast, a sleeping-PC-independent video encoder, or real-time private Systemia telemetry.
- No private Systemia feeds, credentials, customer media or unidentified agents are loaded.
- The separate Mossmere/Window authoritative spectator upgrade remains founder-held and should not be silently promoted into the broadcast.
- The public viewer is sandboxed with `allow-scripts` only. Embedded sources are a fixed, reviewed allowlist.

## Release gate
Run `node --test tests/evercraft-live-portal.test.mjs tests/earthworks-public-playground.test.mjs`, public mobile CI, EarthWorks Fabric CI, Pages deploy, and independent external readback. The hourly public canary verifies the source route and 5 doorways. Do not claim release before a matching live URL is verified. No new paid hosting and no Base44 dependency.
