# syntax=docker/dockerfile:1
# Local Loyalty web app (Next.js, standalone output). Build from the REPO ROOT:
#   docker build -f apps/web/Dockerfile -t ll-web \
#     --build-arg NEXT_PUBLIC_API_URL=https://api.example.com --build-arg NEXT_PUBLIC_SITE_URL=https://example.com .
# NEXT_PUBLIC_* values are compiled into the JavaScript at build time: change one, rebuild the image.
# API_INTERNAL_URL is read at run time (set it on the container, e.g. http://api:4000).
ARG NODE_IMAGE=node:22-slim

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
RUN npm install -g pnpm@10.28.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/mobile/package.json apps/mobile/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY packages/design-tokens/package.json packages/design-tokens/
# The web app and its workspace packages, with the dev dependencies the build needs (tailwind, typescript).
RUN pnpm install --frozen-lockfile --filter "@ll/web..."

FROM deps AS build
COPY apps/web ./apps/web
COPY packages/shared ./packages/shared
COPY packages/design-tokens ./packages/design-tokens
COPY tsconfig.base.json ./
# The legal pages are rendered at build time from docs/legal (lib/legal.ts).
COPY docs/legal ./docs/legal
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ARG NEXT_PUBLIC_SITE_URL=http://localhost:3000
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
ARG NEXT_PUBLIC_APP_STORE_URL=
ARG NEXT_PUBLIC_PLAY_STORE_URL=
ARG NEXT_PUBLIC_WHATSAPP_NUMBER=
ARG NEXT_PUBLIC_MAP_STYLE_URL=
ARG NEXT_PUBLIC_WALLET_BADGES=
# The API is not reachable while the image builds (it may not exist yet). Pages that call it at build time
# fall back and are regenerated at run time (revalidate = 300).
ENV NEXT_OUTPUT=standalone \
    NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY \
    NEXT_PUBLIC_APP_STORE_URL=$NEXT_PUBLIC_APP_STORE_URL \
    NEXT_PUBLIC_PLAY_STORE_URL=$NEXT_PUBLIC_PLAY_STORE_URL \
    NEXT_PUBLIC_WHATSAPP_NUMBER=$NEXT_PUBLIC_WHATSAPP_NUMBER \
    NEXT_PUBLIC_MAP_STYLE_URL=$NEXT_PUBLIC_MAP_STYLE_URL \
    NEXT_PUBLIC_WALLET_BADGES=$NEXT_PUBLIC_WALLET_BADGES
WORKDIR /app/apps/web
RUN npx next build

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app
# Standalone output keeps the monorepo layout: apps/web/server.js plus only the node_modules it needs.
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public ./apps/web/public
USER node
WORKDIR /app/apps/web
EXPOSE 3000
# The home page is server rendered, so a 200 here means Next is serving pages.
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "server.js"]
