# HumanFilter CI and public beta gates

- The deterministic and isolated browser suite runs on each QA branch push/PR.
- The separately scoped extension_e2e.py attempts to load an *actual unpacked Chromium extension* and navigate three URL-intercepted website fixtures. Passing this tests Chrome content-script injection, **not** compatibility with real logged-in feeds.
- A real-world Chrome test is still required before broad release. Take screenshots only of non-sensitive test posts and do not collect users' account or login data.
- Download packages are unsigned development ZIPs. Use Chrome's Load unpacked; no automatic updates or web-store installation.
