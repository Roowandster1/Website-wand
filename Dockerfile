# Runs both the public website and the admin dashboard.
#
# The database is a single SQLite file, so the container needs a persistent
# volume mounted at /data. Without one, every client record disappears when the
# container restarts.

FROM node:22-slim AS deps
WORKDIR /app
# better-sqlite3 is a native module and needs a toolchain to build.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# A throwaway key purely so the build can compile; the real one is supplied at
# runtime and is never baked into the image.
ENV DATA_ENCRYPTION_KEY=YmFzZTY0LWR1bW15LWtleS1mb3ItY2ktb25seS0zMmI=
RUN npm run build

FROM node:22-slim AS run
WORKDIR /app
ENV NODE_ENV=production
ENV DATABASE_PATH=/data/practice.db

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.ts ./next.config.ts
COPY --from=build /app/scripts ./scripts

RUN mkdir -p /data
VOLUME ["/data"]

EXPOSE 3000
CMD ["npm", "start"]
