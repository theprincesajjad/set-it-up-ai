# syntax=docker/dockerfile:1
# Local Loyalty API. Build from the REPO ROOT:
#   docker build -f apps/api/Dockerfile -t ll-api .
# The API (and the @ll/db and @ll/shared workspace packages it imports) ships TypeScript source and runs under tsx,
# the same way `pnpm --filter @ll/api start` does; there is no separate compile step.
# NODE_IMAGE can point at a registry mirror if Docker Hub rate-limits you.
ARG NODE_IMAGE=node:22-slim

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
RUN npm install -g pnpm@10.28.0
# Manifests first so the install layer is cached until a dependency changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/mobile/package.json apps/mobile/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY packages/design-tokens/package.json packages/design-tokens/
# Production dependencies of the API and the workspace packages it uses (no web, no mobile, no dev tools).
RUN pnpm install --frozen-lockfile --prod --filter "@ll/api..."

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    PORT=4000 \
    UPLOADS_DIR=/data/uploads \
    DOCS_DIR=/app/docs
# tsx runs the TypeScript sources. Pinned to the version in pnpm-lock.yaml.
RUN npm install -g tsx@4.23.15 && npm cache clean --force
WORKDIR /app
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --from=deps --chown=node:node /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps --chown=node:node /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=deps --chown=node:node /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node apps/api/package.json apps/api/tsconfig.json ./apps/api/
COPY --chown=node:node apps/api/src ./apps/api/src
COPY --chown=node:node apps/api/assets ./apps/api/assets
COPY --chown=node:node packages/db ./packages/db
COPY --chown=node:node packages/shared ./packages/shared
COPY --chown=node:node tsconfig.base.json ./
# The sales assistant reads these at runtime (DOCS_DIR).
COPY --chown=node:node docs/sales/agent-faq.md ./docs/sales/agent-faq.md
COPY --chown=node:node docs/legal ./docs/legal
RUN mkdir -p /data/uploads && chown -R node:node /data
VOLUME ["/data/uploads"]
USER node
WORKDIR /app/apps/api
EXPOSE 4000
# /health answers without touching the database; it proves the process is up and listening.
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["tsx", "src/server.ts"]
