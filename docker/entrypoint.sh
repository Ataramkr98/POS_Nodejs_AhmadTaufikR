#!/bin/sh
# Starts the KEDAI API.
#
# The demo dataset is generated in memory, so there is nothing to migrate. When
# DATABASE_URL is present the readiness probe reports a live connection, and the
# optional migration below keeps a real database in step with prisma/schema.prisma.
set -e

if [ -n "${DATABASE_URL:-}" ] && [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "Applying database migrations…"
  npx prisma migrate deploy --schema prisma/schema.prisma
fi

exec "$@"
