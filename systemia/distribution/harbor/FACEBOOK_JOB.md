# Harbor Facebook Page jobs

Store the public caption and destination as a tracked JSON file under
`distribution/marketing/`. The job supports a Facebook Page text post with an
optional link.

```json
{
  "schema": "evercraft.harbor.facebook-page-job.v1",
  "page_id": "123456789",
  "message": "Example caption. Replace with approved copy."
}
```

Run **Harbor Facebook Page job** in GitHub Actions using the job path. Its
validation output contains the exact file SHA-256 and Page ID. GitHub Actions
does not have the Page credential. Dispatch is available after the workflow
lands on the default branch.

On the owned Harbor runner, check out the validated revision, review the
caption and destination, and load the following values from trusted operator
configuration, outside the repository:

- `HARBOR_FACEBOOK_APPROVED_SHA256` — the reviewed job hash.
- `HARBOR_FACEBOOK_APPROVED_PAGE_ID` — the intended Page ID.
- `CLIP_FACEBOOK_CREDENTIAL_REF` — the specific Facebook Page vault reference.
- `HARBOR_FACEBOOK_STATE_DIR` — a dedicated persistent directory outside the checkout.
- Existing Home vault configuration via `EVERCRAFT_CREDENTIAL_STATE_DIR` or
  `EVERCRAFT_IDENTITY_STATE_DIR`.

Run the owned worker entry point:

```sh
node systemia/distribution/harbor/facebook-job.mjs publish distribution/marketing/your-job.json
```

The worker confirms the credential represents the requested Page and uses
Evercraft Clip's provider adapter. A successful receipt contains the Page ID,
job hash, Meta post ID and read-back permalink. Repeat runs with the same
Page and normalized post content are held. For an ambiguous attempt, reconcile
in the Page before deciding how to proceed. Deploying an automatic pickup
service requires wiring this entry point into the owned Harbor runtime.
