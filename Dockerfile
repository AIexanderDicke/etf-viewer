# syntax=docker/dockerfile:1

# Build the frontend and drop dev dependencies. Node runs the TypeScript
# backend directly (type stripping), so there is no server build step.
FROM node:24-alpine AS build
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.server.json vite.config.ts index.html ./
COPY shared ./shared
COPY server ./server
COPY src ./src
RUN npx tsc --noEmit -p tsconfig.json \
 && npx tsc --noEmit -p tsconfig.server.json \
 && npx vite build \
 && npm prune --omit=dev

# Runtime holds only production deps, the built frontend and the backend source.
FROM node:24-alpine AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    DB_FILE=/data/etf-viewer.sqlite
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY shared ./shared
COPY server ./server
RUN mkdir -p /data && chown node:node /data
VOLUME ["/data"]
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server/index.ts"]
