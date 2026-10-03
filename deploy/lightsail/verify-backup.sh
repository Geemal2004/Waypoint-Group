#!/usr/bin/env bash
set -euo pipefail
backup="$(realpath "${1:?Pass an absolute private cloud backup path}")"
[[ "$backup" == /opt/waypoint/shared/backups/*.dump ]] || { echo 'Backup must be inside the private backup directory'; exit 1; }
test -s "$backup"
sha256sum -c "$backup.sha256"
token="$(date -u +%s)-$$"
container="waypoint-restore-$token"
cleanup() {
  if [[ "$(docker inspect --format '{{index .Config.Labels "lk.waypoint.restore-verification"}}' "$container" 2>/dev/null || true)" == "$token" ]]; then
    docker rm -f "$container" >/dev/null
  fi
}
trap cleanup EXIT
docker run -d --name "$container" --label "lk.waypoint.restore-verification=$token" \
  --network none --memory 512m --cpus 1 \
  --tmpfs /var/lib/postgresql/data:rw,size=768m \
  -e POSTGRES_PASSWORD=isolated-restore-check -e POSTGRES_DB=restorecheck \
  postgis/postgis:16-3.4 >/dev/null
ready=false
for attempt in $(seq 1 90); do
  if docker exec "$container" pg_isready -h 127.0.0.1 -U postgres -d restorecheck >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
[[ "$ready" == true ]] || { echo 'Isolated restore database did not become ready'; exit 1; }
docker exec -i "$container" pg_restore --exit-on-error --no-owner --no-privileges -U postgres -d restorecheck < "$backup"
counts="$(docker exec "$container" psql -U postgres -d restorecheck -Atc "SELECT (SELECT count(*) FROM flyway_schema_history WHERE success), (SELECT count(*) FROM orders WHERE scenario='S1'), (SELECT count(*) FROM source_records), (SELECT count(*) FROM route_stops s LEFT JOIN route_trips t ON t.id=s.route_trip_id LEFT JOIN orders o ON o.id=s.order_id WHERE t.id IS NULL OR o.id IS NULL), (SELECT count(*) FROM processed_sync_actions)")"
IFS='|' read -r migrations source_orders source_records orphans proofs <<< "$counts"
[[ "$migrations" -ge 7 && "$source_orders" -eq 85 && "$source_records" -ge 12692 && "$orphans" -eq 0 && "$proofs" -gt 0 ]] || { echo 'Restored judge data/evidence checks failed'; exit 1; }
echo "PASS: isolated cloud restore; $migrations migrations, $source_orders S1 orders, $source_records source records, $proofs proof actions, zero orphaned stops. Live database untouched."
