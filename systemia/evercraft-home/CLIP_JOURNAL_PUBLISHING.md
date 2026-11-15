# Evercraft Clip | Durable Home publishing attempts

The authenticated Evercraft Home route `POST /api/clip/journal/facebook` now requires a private, **durable** state directory before the first provider submit:

```sh
# Configure on the owned host, not in public CI or source control.
EVERCRAFT_CLIP_JOURNAL_STATE_DIR=/var/lib/evercraft/clip/journal-attempts
```

The runtime's service account must be able to create and write the directory. The path must be outside the repository and its parents must be managed as private operational storage. The state file is created exclusively with mode 0600 before invoking the provider. One normalized Journal slug corresponds to one claim file.

The important distinction: a Page POST may complete on Meta even if the caller times out before receiving the permalink. Retrying blindly can make duplicate posts. A missing or ambiguous readback is therefore a **reconciliation hold**, not permission for another POST. The API reports `publication_performed: null` for uncertain outcomes, `publication_may_have_occurred: true`, and `automatic_retry_allowed: false`. A claim already present returns HTTP 409 and does not invoke the provider. Previously verified posts remain protected from duplication.

The claim is not an authorization. Every invocation still requires the independently authorized `home.clip.publish` scope and the exact Journal story resource. Sealed Page credentials stay inside Evercraft Home. This work does not provision Meta publishing permissions or certify a live post.

**Operator recovery:** inspect the claim metadata and check the remote Facebook post ID/permalink using the authenticated provider before considering a new campaign release. Do not delete ambiguous claims to force an automatic retry. Use a new separately approved story/campaign identity only after resolving the previous submission.

Validation:

```sh
node --test systemia/evercraft-home/clip-journal-publish-adapter.test.mjs systemia/evercraft-home/clip-journal-publish-http.test.mjs
```

Release is held until the owned runtime is configured, Meta Page authentication is independently verified, a real provider post is read back, and a public post URL is observed. Source-level CI alone does not constitute publication.
