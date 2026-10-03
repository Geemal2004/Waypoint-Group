#!/usr/bin/env bash
set -euo pipefail
release="$(realpath "${1:?Pass /opt/waypoint/releases/<commit>}")"
[[ "$release" =~ ^/opt/waypoint/releases/[a-f0-9]{40}$ ]] || { echo 'Invalid release directory'; exit 1; }
shared=/opt/waypoint/shared
exec 9> "$shared/deploy.lock"
flock -n 9 || { echo 'Another deployment is in progress'; exit 1; }
test -s "$shared/cloud.env"
test -s "$shared/private/shared-network.sql"
test -s "$shared/private/planning-scenario.sql"
test -s "$shared/private/cloud-accounts.sql"
test -s "$shared/osrm/sri-lanka.osrm.properties"
mkdir -p "$release/data"
for pair in 'private private' 'osrm osrm'; do
  read -r target name <<< "$pair"
  if [[ -d "$release/data/$name" && ! -L "$release/data/$name" ]]; then
    # Archives contain only the tracked .gitkeep; never replace populated data.
    test "$(find "$release/data/$name" -type f ! -name .gitkeep | wc -l)" -eq 0
    mv "$release/data/$name" "$release/data/$name.archive-placeholder"
  fi
  ln -sfn "$shared/$target" "$release/data/$name"
done
ln -sfn "$shared/cloud.env" "$release/.env"
cd "$release"
compose=(docker compose -p waypoint-judge -f compose.yaml -f compose.lightsail.yaml --profile routing)
"${compose[@]}" config --quiet
if docker volume inspect waypoint-judge_postgres-data >/dev/null 2>&1; then
  "${compose[@]}" up -d --wait --wait-timeout 120 db
  bash "$release/deploy/lightsail/backup.sh" "$release"
fi
# Serial builds keep the 4 GB instance from compiling Java and Node together.
for service in planning core web; do "${compose[@]}" build "$service"; done
# Spring runs as a non-root user. Grant its group read access only to source
# imports; cloud.env and the account-rotation SQL retain owner-only access.
core_gid="$(docker run --rm --entrypoint id waypoint-judge-core -g)"
sudo chgrp "$core_gid" "$shared/private" "$shared/private/shared-network.sql" "$shared/private/planning-scenario.sql"
sudo chmod 750 "$shared/private"
sudo chmod 640 "$shared/private/shared-network.sql" "$shared/private/planning-scenario.sql"
chmod 600 "$shared/cloud.env" "$shared/private/cloud-accounts.sql"
docker run --rm --entrypoint sh -v "$shared/private:/seed:ro" waypoint-judge-core -c 'test -r /seed/shared-network.sql && test -r /seed/planning-scenario.sql && test ! -r /seed/cloud-accounts.sql'
"${compose[@]}" up -d --wait --wait-timeout 300 db redis planning osrm core web
# Rotate freshly seeded defaults before the HTTPS edge is started. The private
# SQL changes only accounts still using the public default password.
"${compose[@]}" exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1' < "$shared/private/cloud-accounts.sql" >/dev/null
"${compose[@]}" up -d --wait --wait-timeout 300 edge
"${compose[@]}" exec -T planning python -c 'import json,urllib.request; r=json.load(urllib.request.urlopen("http://osrm:5000/nearest/v1/driving/79.867,6.953?number=1",timeout=10)); assert r["code"]=="Ok" and r["waypoints"]'
waypoint_host="$(sed -n 's/^WAYPOINT_HOST=//p' "$shared/cloud.env" | tr -d '\r')"
curl --fail --silent --show-error --output /dev/null --connect-timeout 3 --max-time 10 --retry 6 --retry-delay 2 --retry-all-errors --resolve "$waypoint_host:443:127.0.0.1" "https://$waypoint_host/"
"${compose[@]}" images > "$release/deployed-images.txt"
docker inspect $("${compose[@]}" ps -q) --format '{{.Name}} {{.Image}}' > "$release/deployed-image-digests.txt"
ln -sfn "$release" /opt/waypoint/current
echo "Started release $(basename "$release")"
