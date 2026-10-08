# BALM API — build context is the REPO ROOT (workspace deps live in packages/).
#   docker build -f apps/api/Dockerfile -t balm-api .
#
# Runs via tsx because the workspace deps (@balm/lib-domain, @balm/shared-types)
# export TS source; a future tsup/esbuild bundle step would let it run plain node.
FROM node:22-alpine AS deps
RUN corepack enable
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm install --frozen-lockfile

FROM node:22-alpine AS runtime
RUN corepack enable
ENV NODE_ENV=production
# Inside the container the API must listen on all interfaces (it binds
# 127.0.0.1 by default). Publish it on the host's loopback only, e.g.
#   docker run -p 127.0.0.1:4000:4000 ...
ENV HOST=0.0.0.0
WORKDIR /app
COPY --from=deps /app ./
WORKDIR /app/apps/api
EXPOSE 4000
# Liveness is /health; readiness (with DB ping) is /ready.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://127.0.0.1:4000/health || exit 1
CMD ["pnpm", "exec", "tsx", "src/server.ts"]
