# Forge Operator GitHub Integration

Forge Operator now includes a guarded runtime bridge to GitHub.

## Endpoints

- `GET /api/github/status` verifies the configured credential and reports the authenticated GitHub login.
- `GET /api/github/repos` lists repositories visible to that credential.
- `GET /api/github/repo/:owner/:repo/contents?path=&ref=` reads repository contents.
- `PUT /api/github/repo/:owner/:repo/file` creates or updates UTF-8 text files.

## Safety model

Read access requires `GITHUB_TOKEN`.

Write access is denied unless both are true:

1. `GITHUB_WRITE_ENABLED=true`
2. The exact `owner/repo` is present in `GITHUB_ALLOWED_REPOS`

The initial bridge intentionally has no delete endpoint.

Never commit a real GitHub token. Store credentials in the deployment secret store.

## Credential strategy

A fine-grained token restricted to the required repositories is acceptable for the first deployment.

The durable production path is a dedicated Evercraft GitHub App using short-lived installation tokens and narrowly-scoped repository permissions. That avoids handing Forge a long-lived broad credential and lets Systemia control access per installation.

## Important distinction

Hosting Forge Operator's source code on GitHub does not automatically give the running Forge Operator application GitHub API access. This bridge is the runtime connection that was previously missing.
