#!/usr/bin/env bash
# Conector MCP con administración · pruebas SQL en un PostgreSQL local (sin tocar Supabase).
# Carga el esquema mínimo (tests/fixtures/cam-mcp-admin-stub.sql), aplica la migración
# 20261104150000_cam_mcp_admin.sql y ejecuta tests/cam-mcp-admin.sql.
#
# Uso: CAM_MCP_PG="host=127.0.0.1 port=55432 user=postgres" bash tests/cam-mcp-admin-sql.sh
set -euo pipefail
cd "$(dirname "$0")/.."
CONN="${CAM_MCP_PG:-host=127.0.0.1 port=55432 user=postgres}"
DB="cam_mcp_admin_test_$$"
psql "$CONN dbname=postgres" -qAt -c "create database $DB" >/dev/null
trap 'psql "$CONN dbname=postgres" -qAt -c "drop database $DB" >/dev/null 2>&1 || true' EXIT
run() { psql "$CONN dbname=$DB" -qAt -v ON_ERROR_STOP=1 -f "$1"; }
run tests/fixtures/cam-mcp-admin-stub.sql
run supabase/migrations/20261104150000_cam_mcp_admin.sql
run tests/cam-mcp-admin.sql | grep -v '^$'
echo "cam-mcp-admin-sql: todo OK"
