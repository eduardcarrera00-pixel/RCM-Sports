#!/usr/bin/env bash
# Parties · pruebas SQL en un PostgreSQL local (sin tocar Supabase).
# Crea una base vacía, carga el esquema mínimo de Supabase
# (tests/fixtures/parties-stub.sql), aplica las dos migraciones de Parties y
# ejecuta tests/parties-rls.sql y tests/parties-points.sql.
#
# Uso: PARTIES_PG="host=127.0.0.1 port=55432 user=postgres" bash tests/parties-sql.sh
set -euo pipefail
cd "$(dirname "$0")/.."
CONN="${PARTIES_PG:-host=127.0.0.1 port=55432 user=postgres}"
DB="cam_parties_test_$$"
psql "$CONN dbname=postgres" -qAt -c "create database $DB" >/dev/null
trap 'psql "$CONN dbname=postgres" -qAt -c "drop database $DB" >/dev/null 2>&1 || true' EXIT
run() { psql "$CONN dbname=$DB" -q -v ON_ERROR_STOP=1 -f "$1"; }
run tests/fixtures/parties-stub.sql
run supabase/migrations/20261101230000_cam_parties_tables.sql
run supabase/migrations/20261101230100_cam_parties_functions.sql
run tests/parties-rls.sql
run tests/parties-points.sql
echo "parties-sql: todo OK"
