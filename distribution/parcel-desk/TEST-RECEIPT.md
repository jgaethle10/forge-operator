# Evercraft Parcel Desk v0.4 local QA

- PASS: responsive viewport 390 x 844; zero errors/overflow
- PASS: responsive viewport 1280 x 900; zero errors/overflow
- PASS: channel route warns against unsuitable oversize email attachment
- PASS: 25 MiB +771 B browser ZIP, Python standard zipfile extracts exact chunks + manifest
- PASS: browser-to-browser ZIP sender/recipient round-trip exact-byte integrity
- PASS: receipt correctly labels local byte integrity but not delivery/identity
- PASS: ZIP corruption fails closed and clears prior output
- PASS: unknown ZIP compression rejected
- PASS: retained CLI Python unit test suite passed

All synthetic/local. No real recipient, e-mail, cloud delivery, production host, payment, encryption, virus scan, or customer identity proof. Chromium via set_content, not Safari.
