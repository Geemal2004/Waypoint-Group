#!/usr/bin/env bash
set -euo pipefail
: "${LIGHTSAIL_SSH_KEY:?Set the SSH_PRIVATE_KEY repository secret}"
: "${LIGHTSAIL_HOST:?Missing host}"
: "${LIGHTSAIL_USER:?Missing user}"
[[ "$GITHUB_SHA" =~ ^[a-f0-9]{40}$ ]]
[[ "$LIGHTSAIL_HOST" =~ ^[A-Za-z0-9.-]+$ ]]
[[ "$LIGHTSAIL_USER" =~ ^[a-z_][a-z0-9_-]*$ ]]
ssh_dir="$(mktemp -d)"
trap 'rm -rf -- "$ssh_dir"' EXIT
chmod 700 "$ssh_dir"
printf '%s\n' "$LIGHTSAIL_SSH_KEY" | tr -d '\r' > "$ssh_dir/key"
cp deploy/lightsail/known_hosts "$ssh_dir/known_hosts"
chmod 600 "$ssh_dir/key" "$ssh_dir/known_hosts"
unset LIGHTSAIL_SSH_KEY
ssh_options=(-i "$ssh_dir/key" -o BatchMode=yes -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$ssh_dir/known_hosts" -o ConnectTimeout=15 -o ServerAliveInterval=30 -o ServerAliveCountMax=6)
archive="tmp/releases/$GITHUB_SHA/waypoint-source.tar.gz"
test -s "$archive"
hash="$(sha256sum "$archive" | cut -d ' ' -f1)"
scp "${ssh_options[@]}" "$archive" "$LIGHTSAIL_USER@$LIGHTSAIL_HOST:/opt/waypoint/releases/$GITHUB_SHA.tar.gz"
ssh "${ssh_options[@]}" "$LIGHTSAIL_USER@$LIGHTSAIL_HOST" "set -eu; cd /opt/waypoint/releases; echo '$hash  $GITHUB_SHA.tar.gz' | sha256sum -c -; mkdir -p '$GITHUB_SHA'; tar -xzf '$GITHUB_SHA.tar.gz' -C '$GITHUB_SHA'; bash '$GITHUB_SHA/deploy/lightsail/start-release.sh' '/opt/waypoint/releases/$GITHUB_SHA'"
curl --fail --silent --show-error --output /dev/null --retry 3 --max-time 20 https://18-138-29-235.sslip.io/
printf 'Deployed commit %s\n' "$GITHUB_SHA" >> "$GITHUB_STEP_SUMMARY"
