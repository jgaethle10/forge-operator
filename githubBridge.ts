import { Router, Request, Response } from 'express';

const router = Router();
const API_ROOT = 'https://api.github.com';

function token(): string | null {
  return process.env.GITHUB_TOKEN?.trim() || null;
}

function allowlist(): Set<string> {
  return new Set(
    (process.env.GITHUB_ALLOWED_REPOS || '')
      .split(',')
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean),
  );
}

function writesEnabled(): boolean {
  return process.env.GITHUB_WRITE_ENABLED === 'true';
}

function safePart(value: string): boolean {
  return /^[A-Za-z0-9_.-]+$/.test(value);
}

function safePath(value: string): boolean {
  return Boolean(value) && !value.startsWith('/') && !value.includes('..');
}

function headers(extra: Record<string, string> = {}) {
  const value = token();
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'Evercraft-Forge-Operator',
    ...(value ? { Authorization: `Bearer ${value}` } : {}),
    ...extra,
  };
}

async function githubFetch(path: string, init: RequestInit = {}) {
  if (!token()) {
    throw Object.assign(new Error('Forge Operator GitHub credential is not configured.'), { status: 503 });
  }

  const response = await fetch(`${API_ROOT}${path}`, {
    ...init,
    headers: {
      ...headers(),
      ...(init.headers || {}),
    },
  });

  const raw = await response.text();
  let data: any = null;

  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = raw;
    }
  }

  if (!response.ok) {
    const message = typeof data === 'object' && data?.message
      ? String(data.message)
      : `GitHub request failed with ${response.status}`;
    throw Object.assign(new Error(message), { status: response.status, details: data });
  }

  return data;
}

router.get('/status', async (_req: Request, res: Response) => {
  if (!token()) {
    res.json({
      configured: false,
      writeEnabled: false,
      allowedRepos: [],
    });
    return;
  }

  try {
    const viewer = await githubFetch('/user');
    res.json({
      configured: true,
      authenticatedAs: viewer?.login || null,
      writeEnabled: writesEnabled(),
      allowedRepos: [...allowlist()],
    });
  } catch (error: any) {
    res.status(error?.status || 500).json({
      configured: true,
      authenticated: false,
      error: error?.message || 'GitHub authentication check failed.',
    });
  }
});

router.get('/repos', async (_req: Request, res: Response) => {
  try {
    const repos = await githubFetch(
      '/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member',
    );

    res.json({
      success: true,
      repositories: Array.isArray(repos)
        ? repos.map((repo: any) => ({
            fullName: repo.full_name,
            private: Boolean(repo.private),
            defaultBranch: repo.default_branch,
            permissions: repo.permissions || null,
            htmlUrl: repo.html_url,
          }))
        : [],
    });
  } catch (error: any) {
    res.status(error?.status || 500).json({
      success: false,
      error: error?.message || 'Failed to list GitHub repositories.',
    });
  }
});

router.get('/repo/:owner/:repo/contents', async (req: Request, res: Response) => {
  const { owner, repo } = req.params;
  const requestedPath = String(req.query.path || '');
  const ref = String(req.query.ref || '');

  if (!safePart(owner) || !safePart(repo) || (requestedPath && !safePath(requestedPath))) {
    res.status(400).json({ success: false, error: 'Invalid repository or path.' });
    return;
  }

  try {
    const encodedPath = requestedPath
      ? '/' + requestedPath.split('/').map(encodeURIComponent).join('/')
      : '';
    const query = ref ? `?ref=${encodeURIComponent(ref)}` : '';

    const data = await githubFetch(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents${encodedPath}${query}`,
    );

    res.json({ success: true, data });
  } catch (error: any) {
    res.status(error?.status || 500).json({
      success: false,
      error: error?.message || 'Failed to read repository contents.',
    });
  }
});

router.put('/repo/:owner/:repo/file', async (req: Request, res: Response) => {
  const { owner, repo } = req.params;
  const fullName = `${owner}/${repo}`;
  const { path, content, message, branch, sha } = req.body || {};

  if (!safePart(owner) || !safePart(repo) || !safePath(String(path || ''))) {
    res.status(400).json({ success: false, error: 'Invalid repository or file path.' });
    return;
  }

  if (!writesEnabled() || !allowlist().has(fullName.toLowerCase())) {
    res.status(403).json({
      success: false,
      error: 'GitHub writes are disabled or this repository is not allowlisted.',
    });
    return;
  }

  if (typeof content !== 'string' || typeof message !== 'string' || !message.trim()) {
    res.status(400).json({
      success: false,
      error: 'content and message are required.',
    });
    return;
  }

  try {
    const encodedPath = String(path).split('/').map(encodeURIComponent).join('/');
    const body: Record<string, unknown> = {
      message: message.trim(),
      content: Buffer.from(content, 'utf8').toString('base64'),
    };

    if (branch) body.branch = String(branch);
    if (sha) body.sha = String(sha);

    const data = await githubFetch(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );

    res.json({
      success: true,
      commit: data?.commit
        ? { sha: data.commit.sha, htmlUrl: data.commit.html_url }
        : null,
      content: data?.content
        ? { sha: data.content.sha, path: data.content.path }
        : null,
    });
  } catch (error: any) {
    res.status(error?.status || 500).json({
      success: false,
      error: error?.message || 'Failed to write repository file.',
    });
  }
});

export default router;
