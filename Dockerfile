FROM node:22-alpine AS build
WORKDIR /app

COPY package.json bun.lock ./
RUN npm install

COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server.ts ./server.ts
COPY --from=build /app/systemia/chum/discovery-router.mjs ./systemia/chum/discovery-router.mjs
COPY --from=build /app/systemia/chum/pain-index-lib.mjs ./systemia/chum/pain-index-lib.mjs
COPY --from=build /app/systemia/chum/attribution.ts ./systemia/chum/attribution.ts
COPY --from=build /app/systemia/chum/live-intent-hunter.mjs ./systemia/chum/live-intent-hunter.mjs
COPY --from=build /app/systemia/chum/crawler-radar.mjs ./systemia/chum/crawler-radar.mjs
COPY --from=build /app/systemia/media-studio ./systemia/media-studio
COPY --from=build /app/registry ./registry
COPY --from=build /app/dist ./dist

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT}/api/health || exit 1

CMD ["npm", "start"]
