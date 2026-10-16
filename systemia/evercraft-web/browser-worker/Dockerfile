FROM mcr.microsoft.com/playwright:v1.63.0-noble

WORKDIR /app
COPY package.json ./
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npm install --omit=dev --no-audit --no-fund
COPY policy.mjs secure-proxy.mjs snapshot-contract.mjs delegated-session-policy.mjs authenticated-handoff.mjs durable-jobs.mjs systemia-admission.mjs job-application-preflight.mjs server.mjs ./

# Resolve new runtime module at build time, not after the container starts.
RUN node --check server.mjs && node --check job-application-preflight.mjs && node -e "import('./job-application-preflight.mjs').then(m => { if(typeof m.jobApplicationPreflight !== 'function') process.exit(1) })"

ENV NODE_ENV=production
ENV PORT=8787
RUN install -d -m 0700 -o pwuser -g pwuser /var/lib/evercraft-browser-jobs
USER pwuser
EXPOSE 8787

CMD ["node","server.mjs"]
