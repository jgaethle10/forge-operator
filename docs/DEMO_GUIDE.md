# File Ferry: truthful demo route

No hosted public demo or video link has been produced by this source package. To record a demo:

1. Run `python3 -m http.server 8765` and open `http://localhost:8765/`.
2. Choose a **synthetic, nonconfidential** text or binary file, select 0.5 MiB and exact mode.
3. Show the generated manifest and numbered files. Open `reassemble.html`, supply the manifest and all pieces, and demonstrate checksum validation.
4. Deliberately alter one part and show the refusal rather than claiming tampered content was delivered.
5. If testing the open AI feature, press **Load open AI** and capture an actual successful 384-dimensional model inference followed by a text question and source-evidence extraction. If loading fails, report that honestly, and do not claim end-to-end AI validation.
6. Publish the real video (or deployed project) and source link before including them in the DEV article.

The test code demonstrates synthetic byte-integrity locally. It does not prove provider delivery or commercial use.