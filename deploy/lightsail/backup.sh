#!/usr/bin/env bash
set -euo pipefail
release="$(realpath "${1:-/opt/waypoint/current}")"
[[ "$release" =~ ^/opt/waypoint/releases/[a-f0-9]{40}$ ]] || { echo 'Invalid release directory'; exit 1; }
umask 077
directory=/opt/waypoint/shared/backups
mkdir -p "$directory"
backup="$directory/waypoint-$(date -u +%Y%m%dT%H%M%SZ)-$$-$(basename "$release").dump"
cd "$release"
compose=(docker compose -p waypoint-judge -f compose.yaml -f compose.lightsail.yaml --profile routing)
"${compose[@]}" exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$backup.partial"
"${compose[@]}" exec -T db pg_restore --list < "$backup.partial" >/dev/null
mv "$backup.partial" "$backup"
sha256sum "$backup" > "$backup.sha256"
echo "Private database backup: $backup"
