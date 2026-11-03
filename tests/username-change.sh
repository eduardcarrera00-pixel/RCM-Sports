#!/usr/bin/env bash
# Cambio de nombre de usuario · prueba SQL en un PostgreSQL local (sin tocar Supabase).
# Uso: USERNAME_PG="host=127.0.0.1 port=55432 user=postgres" bash tests/username-change.sh
set -euo pipefail
cd "$(dirname "$0")/.."
CONN="${USERNAME_PG:-host=127.0.0.1 port=55432 user=postgres}"
DB="cam_username_test_$$"
psql "$CONN dbname=postgres" -qAt -c "create database $DB" >/dev/null
trap 'psql "$CONN dbname=postgres" -qAt -c "drop database $DB" >/dev/null 2>&1 || true' EXIT
psql "$CONN dbname=$DB" -q -o /dev/null -v ON_ERROR_STOP=1 -f tests/username-change.sql
echo "username-change: todo OK"
