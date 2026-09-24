# All-in-one NumzStudy image: bundles the static frontend, the backend
# (server/), and a local Postgres — one `docker run` is the whole
# deployment. See README.md's "One-image deployment" section.
#
# Postgres lives in the same image (rather than a separate container/
# compose file) because this app's whole point is being trivial to
# self-host for one person's own use — a single container with a single
# mounted volume is the simplest thing that can work at that scale. It's
# a deliberate trade-off, not an oversight: nothing stops pointing
# DATABASE_URL at an external Postgres instead (see docker-entrypoint.sh),
# which is the better call for anything beyond personal/small-group use.
FROM node:20-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends postgresql \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install server dependencies first so this layer only rebuilds when the
# dependency list actually changes, not on every source edit.
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev

COPY server/prisma ./server/prisma
RUN cd server && npx prisma generate

COPY server/src ./server/src
COPY server/scripts ./server/scripts

# The frontend: same relative layout as the repo itself, so
# server/src/app.js's default FRONTEND_DIR (two levels up from itself)
# resolves correctly in both this image and plain local development.
COPY index.html manifest.json sw.js ./
COPY css ./css
COPY js ./js
COPY icons ./icons

COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

ENV PORT=8787
EXPOSE 8787
VOLUME ["/data"]

ENTRYPOINT ["./docker-entrypoint.sh"]
