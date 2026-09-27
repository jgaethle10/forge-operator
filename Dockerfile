FROM node:22-alpine AS build
WORKDIR /app

COPY package.json bun.lock ./
RUN npm install

COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
RUN apk add --no-cache ffmpeg && ffmpeg -version && ffprobe -version
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server.ts ./server.ts
COPY --from=build /app/systemia/chum ./systemia/chum
COPY --from=build /app/systemia/mcp ./systemia/mcp
COPY --from=build /app/systemia/media-studio ./systemia/media-studio
COPY --from=build /app/systemia/rivet ./systemia/rivet
COPY --from=build /app/systemia/beast-mode ./systemia/beast-mode
COPY --from=build /app/registry ./registry
COPY --from=build /app/dist ./dist

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT}/api/health || exit 1

CMD ["npm", "start"]
