FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY agent.mjs demo.mjs cli.mjs server.mjs ./
COPY public ./public
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
CMD ["node","server.mjs"]
