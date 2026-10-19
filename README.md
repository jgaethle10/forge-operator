# File Ferry

**A local-first file handoff workbench for freelancers and small teams.**

File Ferry helps prepare a client deliverable for a chosen attachment-size budget, without uploading that deliverable to a File Ferry server. It can keep the exact bytes, prepare verified numbered parts with a recipient-side reassembly page, or offer a clearly labeled lossy/compact derivative for supported images and text.

For readable text, the optional open-weight AI feature uses the Xenova/all-MiniLM-L6-v2 embedding model to identify relevant **unaltered source sentences** for a recipient question. File Ferry never treats an extractive brief as equivalent to the original file.

Created October 12, 2026 for the Hacktoberfest 2026 Week 2 Side Hustle challenge. Copyright 2026 Evercraft LLC, licensed MIT. The optional third-party inference runtime and model remain subject to their respective independent licenses; they are not bundled in this source archive.

## Run

No paid account required. Use a current browser:

```bash
python3 -m http.server 8765
```

Open http://localhost:8765 to prepare files, or `/reassemble.html` to verify and reconstruct the original from the manifest and pieces. Run source tests with:

```bash
npm test
```

## What works

- Local file-selection and deterministic budget routing.
- Exact original retention or lossless split-and-reassemble with per-part SHA-256 verification.
- Optional browser-built WebP derivative for images, **lossy and not equivalent to the source**.
- Compression attempt for readable text, with fallback to exact parts.
- AI evidence pathway, which requires downloading a separate open-weight model and demonstrating actual inference before showing a verified indicator.

## Limits and honesty

- **No transport service:** the app does not send email, upload files, prove recipient delivery, or replace Dropbox/Drive. You download outputs and use your own chosen channel.
- Model code is implemented, but **real 384-dimensional model inference has not yet been independently verified in the target browser**; do not imply this is a fully validated AI deployment.
- Opening the demo requires a modern browser. First model load requires network access to external runtime and model hosts. The runtime currently uses a pinned jsDelivr package import; production use should vendor and audit this dependency.
- PDFs are preserved and can be split; this does **not** parse or summarize PDF pages.
- The browser limits full-file SHA-256 for files larger than 32 MiB; per-part checksums still apply. Hash checks verify byte identity, not malware safety or authenticity of the sender.
- An AI evidence brief may omit essential facts and should not be used alone for regulated or high-stakes record keeping.
- No verified customers, orders, revenue, independent production deployment, or completed third-party delivery are claimed.

## Model and third-party notices

On optional user request, File Ferry imports `@huggingface/transformers@3.8.1` from jsDelivr and downloads `Xenova/all-MiniLM-L6-v2` from the model host. These third-party components are **not included** in this repository or covered by File Ferry's MIT grant. Verify provider and dependency license notices before redistributing their code or weights.

## Security

For sensitive or confidential client work, verify the browser environment and every output before sharing. Source files are intended for browser-local processing, but the optional runtime and model require fetching external code or weights. Do not mistake local-processing intent for a security audit or independent proof that remote hosts never see data.

## License

File Ferry source code: MIT, see [LICENSE](LICENSE). Copyright 2026 Evercraft LLC. This license applies only to the files in this File Ferry repository, not to other Evercraft services or private intellectual property.