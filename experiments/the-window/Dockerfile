FROM node:24-alpine
ENV NODE_ENV=production PORT=8787 WINDOW_DATA_DIR=/app/data
WORKDIR /app
COPY --chown=node:node engine.mjs durable-store.mjs server.mjs ./
COPY --chown=node:node public ./public
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:8787/api/health').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"
CMD ["node","server.mjs"]
