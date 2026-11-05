# syntax=docker/dockerfile:1
# Phat Loot container image.
#
#   docker build -t phat-loot .
#   docker run -d -p 3000:3000 -v phat-loot-data:/app/data \
#     -e APP_URL=https://loot.example.com phat-loot
#   docker exec -it <container> gm create <email>
#
# The database and uploads live in /app/data; mount a volume there. Run one
# container per database: the live-update bus is in memory (see CLAUDE.md).

ARG BUN_VERSION=1.4.4

# --- Build ----------------------------------------------------------------
# `bun run build` bundles the server, the client it serves and the GM CLI
# into dist/, dependencies included, so the runtime image needs no
# node_modules.
FROM oven/bun:${BUN_VERSION}-slim AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY bunfig.toml tsconfig.json ./
COPY scripts ./scripts
COPY src ./src
RUN bun run build

# --- Runtime --------------------------------------------------------------
FROM oven/bun:${BUN_VERSION}-slim

ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/app/data/app.db \
    UPLOAD_DIR=/app/data/uploads

COPY --from=build /app/dist /app/dist
# Host files may be private (umask 077); the bun user must be able to read
# these, but not change them.
COPY --chmod=u=rwX,go=rX drizzle /app/drizzle

# `gm` runs the GM CLI from any directory. /app/data is created here so a
# fresh named volume takes on the unprivileged owner.
RUN printf '#!/bin/sh\nexec bun /app/dist/cli/gm.js "$@"\n' \
      > /usr/local/bin/gm \
 && chmod 755 /usr/local/bin/gm \
 && mkdir -p /app/data/uploads \
 && chown -R bun:bun /app/data
VOLUME /app/data

# A built server looks up its client files relative to the working
# directory, so it must run from beside them.
WORKDIR /app/dist/server
USER bun
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["bun", "-e", "fetch(`http://127.0.0.1:${process.env.PORT}/`).then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

CMD ["bun", "index.js"]
