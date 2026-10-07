# syntax=docker/dockerfile:1
# ─────────────────────────────────────────────────────────────────────────────
# KEDAI API — multi-stage build, runs as a non-root user.
# Prisma engines are installed in the builder so the runtime image stays small.
# ─────────────────────────────────────────────────────────────────────────────

FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV NPM_CONFIG_FUND=false NPM_CONFIG_AUDIT=false

# ── Dependencies ─────────────────────────────────────────────────────────────
FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# ── Build ────────────────────────────────────────────────────────────────────
FROM deps AS builder
COPY nest-cli.json tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npx prisma generate --schema prisma/schema.prisma \
 && npm run build \
 && npm prune --omit=dev

# ── Runtime ──────────────────────────────────────────────────────────────────
FROM base AS runtime
ENV NODE_ENV=production

RUN groupadd --system --gid 1001 kedai \
 && useradd --system --uid 1001 --gid kedai kedai

COPY --from=builder --chown=kedai:kedai /app/node_modules ./node_modules
COPY --from=builder --chown=kedai:kedai /app/dist ./dist
COPY --from=builder --chown=kedai:kedai /app/prisma ./prisma
COPY --from=builder --chown=kedai:kedai /app/package.json ./package.json
COPY --chown=kedai:kedai docker/entrypoint.sh ./docker/entrypoint.sh

RUN chmod +x ./docker/entrypoint.sh && mkdir -p /app/output && chown -R kedai:kedai /app/output

USER kedai
EXPOSE 4000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["./docker/entrypoint.sh"]
CMD ["node", "dist/src/main.js"]
