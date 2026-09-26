#!/usr/bin/env bash
# Boots the all-in-one NumzStudy image: a local Postgres cluster (unless
# DATABASE_URL already points somewhere else), persistent JWT/VAPID
# secrets (unless the environment supplies them), migrations, then the Node
# server — which also serves the frontend (see server/src/app.js). Data that
# needs to survive a container restart or recreate lives under /data, so
# that's the one path worth mounting a volume at.
set -euo pipefail

if [ -z "${GOOGLE_CLIENT_ID:-}" ]; then
  echo "GOOGLE_CLIENT_ID is not set — pass it with -e GOOGLE_CLIENT_ID=... (see README)." >&2
  exit 1
fi

mkdir -p /data

PG_BIN="$(find /usr/lib/postgresql -mindepth 1 -maxdepth 1 -type d | sort -V | tail -1)/bin"
export PATH="$PG_BIN:$PATH"

if [ -z "${DATABASE_URL:-}" ]; then
  PGDATA=/data/pgdata
  mkdir -p "$PGDATA"
  chown -R postgres:postgres /data

  if [ ! -s "$PGDATA/PG_VERSION" ]; then
    echo "Initializing local Postgres data directory..."
    su postgres -c "initdb -D '$PGDATA' -U postgres --auth=trust" > /dev/null
  fi

  echo "Starting local Postgres..."
  su postgres -c "pg_ctl -D '$PGDATA' -l /data/postgres.log -o '-c listen_addresses=localhost -p 5432' start"

  for _ in $(seq 1 30); do
    if su postgres -c "pg_isready -q"; then break; fi
    sleep 1
  done

  su postgres -c "psql -tc \"SELECT 1 FROM pg_roles WHERE rolname='numzstudy'\"" | grep -q 1 \
    || su postgres -c "psql -c \"CREATE ROLE numzstudy WITH LOGIN PASSWORD 'numzstudy';\""
  su postgres -c "psql -tc \"SELECT 1 FROM pg_database WHERE datname='numzstudy'\"" | grep -q 1 \
    || su postgres -c "psql -c \"CREATE DATABASE numzstudy OWNER numzstudy;\""

  export DATABASE_URL="postgresql://numzstudy:numzstudy@localhost:5432/numzstudy"
else
  echo "DATABASE_URL is set — using that instead of the bundled local Postgres."
fi

# The JWT/VAPID secrets come from the environment when an orchestrator or a
# compose .env supplies them, in which case nothing needs persisting here.
# With none supplied they are generated once into /data/secrets.env and reused
# from there. All four or none: sourcing the file would otherwise silently
# overwrite whichever ones were supplied.
SECRET_VARS=(JWT_ACCESS_SECRET JWT_REFRESH_SECRET VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY)
supplied=0
for name in "${SECRET_VARS[@]}"; do
  if [ -n "${!name:-}" ]; then supplied=$((supplied + 1)); fi
done

if [ "$supplied" -eq "${#SECRET_VARS[@]}" ]; then
  echo "Using JWT/VAPID secrets from the environment."
elif [ "$supplied" -eq 0 ]; then
  SECRETS_FILE=/data/secrets.env
  if [ ! -f "$SECRETS_FILE" ]; then
    echo "First boot: generating persistent JWT/VAPID secrets into $SECRETS_FILE..."
    node /app/server/scripts/generateSecrets.js > "$SECRETS_FILE"
  fi
  # shellcheck disable=SC1090
  set -a; source "$SECRETS_FILE"; set +a
else
  echo "Set all of ${SECRET_VARS[*]} or none of them (none: generated into /data/secrets.env)." >&2
  exit 1
fi

cd /app/server
echo "Applying database migrations..."
npx prisma migrate deploy

echo "Starting NumzStudy..."
exec node src/index.js
