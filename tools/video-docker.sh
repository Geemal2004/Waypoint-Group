#!/bin/sh
# Local fallback for a stalled Docker Desktop Windows proxy. Uses Docker's own CLI.
set -eu
video_engine_pid=$(cat /var/run/linuxkit-parent.pid)
exec /mnt/host/wsl/docker-desktop/cli-tools/usr/bin/docker \
  -H "unix:///proc/$video_engine_pid/root/run/docker.raw.sock" "$@"
