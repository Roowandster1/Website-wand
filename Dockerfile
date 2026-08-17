# Runs both the public website and the admin dashboard.
#
# The database is a single SQLite file, so this needs a persistent volume
# mounted at /data. Without one it will still start, but every client record
# disappears on the next restart — see "Putting it online" in README.md.

# --- Dependencies -----------------------------------------------------------
# better-sqlite3 is a native module and needs a C++ toolchain to build.
FROM node:22-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

# --- Build ------------------------------------------------------------------
FROM node:22-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# A throwaway key so the build can compile the encryption code. The real one is
# supplied at runtime and is never baked into the image.
ENV DATA_ENCRYPTION_KEY=YnVpbGQtdGltZS1wbGFjZWhvbGRlci0zMi1ieXRlcy4=
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# --- Run --------------------------------------------------------------------
FROM node:22-slim AS run
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Defaults that assume a volume at /data. Override DATABASE_PATH if you mount
# it somewhere else.
ENV DATABASE_PATH=/data/practice.db
ENV BACKUP_DIR=/data/backups

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.ts ./next.config.ts
COPY --from=build /app/scripts ./scripts

RUN mkdir -p /data && chmod 700 /data

# Railway (and most hosts) inject PORT and expect the app to bind to it.
# `next start` reads PORT, and 0.0.0.0 is required — binding to localhost would
# make the container unreachable and fail every healthcheck.
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
EXPOSE 3000

CMD ["npx", "next", "start", "--hostname", "0.0.0.0"]
