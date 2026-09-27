FROM mcr.microsoft.com/playwright:v1.63.0-noble

WORKDIR /app
COPY package.json ./
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npm install --omit=dev --no-audit --no-fund
COPY policy.mjs runtime.mjs server.mjs ./

ENV NODE_ENV=production
ENV PORT=8787
ENV FALLEN_RENDER_ASSET_ROOT=/work/assets
ENV FALLEN_RENDER_OUTPUT_ROOT=/work/output
RUN mkdir -p /work/assets /work/output && chown -R pwuser:pwuser /work
USER pwuser
EXPOSE 8787
CMD ["node","server.mjs"]
