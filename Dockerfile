# Runs both the public website and the admin dashboard.
#
# The database is a single SQLite file, so this needs a persistent volume
# mounted at /data. Without one it will still start, but every client record
# disappears on the next restart — see "Putting it online" in README.md.
#
# Two things keep this buildable on a modest builder, both learned the hard way:
# .dockerignore keeps a 620MB local node_modules out of the build context, and
# Next's standalone output means the final stage copies ~74MB of traced files
# rather than a 460MB node_modules. Copying the latter is what made an earlier
# version die with "context canceled" partway through.

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
ENV BUILD_STANDALONE=1
# Guarantees these exist before the final stage copies them. `public` is
# tracked in git via a placeholder file, but an empty folder is invisible to git
# and a COPY of a path that does not exist fails the whole build with
# "failed to calculate checksum" — which reads like corruption, not a missing
# folder. Belt and braces, because that error costs a deploy to diagnose.
RUN mkdir -p public scripts && npm run build

# --- Run --------------------------------------------------------------------
FROM node:22-slim AS run
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Defaults that assume a volume at /data. Override DATABASE_PATH if you mount
# it somewhere else.
ENV DATABASE_PATH=/data/practice.db
ENV BACKUP_DIR=/data/backups

# The standalone bundle carries its own minimal node_modules, including the
# compiled better-sqlite3 binary. Static assets and public files sit outside it
# and have to be placed by hand.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# Kept so a backup can be decrypted from inside the container if ever needed.
COPY --from=build /app/scripts ./scripts

RUN mkdir -p /data && chmod 700 /data

# Railway (and most hosts) inject PORT, and the server binds to it — that part
# is wanted.
ENV PORT=3000
EXPOSE 3000

# HOSTNAME is forced here, at start time, rather than with ENV.
#
# The standalone server does `process.env.HOSTNAME || '0.0.0.0'`, and container
# runtimes set HOSTNAME to the container's own id. That value overrides anything
# ENV puts in the image, so the server tries to resolve the container id as an
# address and dies with "getaddrinfo ENOTFOUND" before it ever listens. The
# platform then reports the deploy as started but every healthcheck fails, which
# points nowhere near the real cause.
#
# `exec` keeps node as PID 1 so it still receives stop signals.
# `next start` does not run a standalone build; the traced server does.
CMD ["sh", "-c", "HOSTNAME=0.0.0.0 exec node server.js"]
