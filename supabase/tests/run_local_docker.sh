#!/usr/bin/env bash
# ============================================================================
# CivicFlow — run Stage 1 schema tests against a disposable Docker Postgres.
#
# Requires: Docker. Nothing outside the container is modified; the test
# transaction rolls back and the container is removed afterwards.
#
# Usage:  supabase/tests/run_local_docker.sh
# ============================================================================
set -euo pipefail

CONTAINER_NAME="civicflow-pgtest"
IMAGE="postgis/postgis:16-3.4"
PORT="${PGTEST_PORT:-54329}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! docker info >/dev/null 2>&1; then
  echo "error: docker is not running" >&2
  exit 1
fi

cleanup() {
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

cleanup

echo "==> starting $IMAGE on port $PORT ..."
docker run -d --name "$CONTAINER_NAME" \
  -e POSTGRES_PASSWORD=postgres \
  -p "$PORT":5432 \
  "$IMAGE" >/dev/null

echo "==> waiting for postgres ..."
until docker exec "$CONTAINER_NAME" pg_isready -U postgres >/dev/null 2>&1; do
  sleep 1
done

echo "==> applying test-only auth shim ..."
docker exec -i "$CONTAINER_NAME" psql -U postgres -v ON_ERROR_STOP=1 -q \
  < "$DIR/auth_shim.sql"

echo "==> applying migration ..."
docker exec -i "$CONTAINER_NAME" psql -U postgres -v ON_ERROR_STOP=1 -q \
  < "$DIR/../migrations/0001_initial_schema.sql"

echo "==> applying seed ..."
docker exec -i "$CONTAINER_NAME" psql -U postgres -v ON_ERROR_STOP=1 -q \
  < "$DIR/../seed.sql"

echo "==> running smoke tests ..."
docker exec -i "$CONTAINER_NAME" psql -U postgres -v ON_ERROR_STOP=1 \
  < "$DIR/0001_smoke_test.sql"

echo
echo "ALL TESTS PASSED ✔"
