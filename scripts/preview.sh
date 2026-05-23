#!/usr/bin/env bash
set -euo pipefail

TAG="${1:-latest}"
CONTAINER_NAME="event-week-top-preview"
PORT=3000

remote_url=$(git -C "$(dirname "$0")/.." remote get-url origin)
slug=${remote_url#*github.com[:/]}
slug=${slug%.git}
slug=$(printf '%s' "$slug" | tr '[:upper:]' '[:lower:]')

IMAGE="ghcr.io/${slug}/preview:${TAG}"

echo "Pulling ${IMAGE}"
docker pull "$IMAGE"

if docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
  docker rm -f "$CONTAINER_NAME" >/dev/null
fi

echo "Starting preview on http://localhost:${PORT} (Ctrl-C to stop)"
exec docker run --rm -it \
  --name "$CONTAINER_NAME" \
  -p "${PORT}:3000" \
  "$IMAGE"
