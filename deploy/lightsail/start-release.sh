#!/usr/bin/env bash
set -euo pipefail
release="$(realpath "${1:?Pass /opt/waypoint/releases/<commit>}")"
[[ "$release" =~ ^/opt/waypoint/releases/[a-f0-9]{40}$ ]] || { echo 'Invalid release directory'; exit 1; }
shared=/opt/waypoint/shared
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
if [[ -n "$("${compose[@]}" ps -q db)" ]]; then
  bash "$release/deploy/lightsail/backup.sh" "$release"
fi
# Serial builds keep the 4 GB instance from compiling Java and Node together.
for service in planning core web; do "${compose[@]}" build "$service"; done
"${compose[@]}" up -d --wait --wait-timeout 300 db redis planning osrm core web
# Rotate freshly seeded defaults before the HTTPS edge is started. The private
# SQL changes only accounts still using the public default password.
"${compose[@]}" exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1' < "$shared/private/cloud-accounts.sql" >/dev/null
"${compose[@]}" up -d --wait --wait-timeout 300 edge
"${compose[@]}" images > "$release/deployed-images.txt"
docker inspect $("${compose[@]}" ps -q) --format '{{.Name}} {{.Image}}' > "$release/deployed-image-digests.txt"
ln -sfn "$release" /opt/waypoint/current
echo "Started release $(basename "$release")"
