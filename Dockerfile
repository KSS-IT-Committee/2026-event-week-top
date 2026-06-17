# Mirrors 2026-server-ansible/roles/apps/templates/Dockerfile.nextjs.j2
# so a local preview behaves the same as the production VPS runtime.

FROM node:24-alpine@sha256:21f403ab171f2dc89bad4dd69d7721bfd15f084ccb46cdd225f31f2bc59b5c9a AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then \
      npm ci --no-audit --no-fund; \
    else \
      npm install --no-audit --no-fund; \
    fi

FROM node:24-alpine@sha256:21f403ab171f2dc89bad4dd69d7721bfd15f084ccb46cdd225f31f2bc59b5c9a AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-alpine@sha256:21f403ab171f2dc89bad4dd69d7721bfd15f084ccb46cdd225f31f2bc59b5c9a AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# `output: standalone` (next.config.ts) emits a self-contained server with only
# the traced runtime deps plus a minimal server.js (replaces `next start`). The
# trace does NOT include public/ or .next/static, so copy those in by hand.
# Migrations are NOT run from this image — the preview compose uses 2026-db's
# migrator image, which is also the sole production migrator.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
# Persistent files dir. At runtime the deploy scripts bind-mount a host dir here
# (which overlays this), but create it owned by the app user so the image is
# also usable — and writable — when run without the mount (e.g. scripts/preview.sh).
RUN mkdir -p /app/files && chown nextjs:nodejs /app/files

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
