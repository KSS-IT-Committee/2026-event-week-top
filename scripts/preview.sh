#!/usr/bin/env bash
set -euo pipefail

TAG="${1:-latest}"
CONTAINER_NAME="event-week-top-preview"
PORT=3000

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${REPO_ROOT}/.env.local"

remote_url=$(git -C "$REPO_ROOT" remote get-url origin)
slug=${remote_url#*github.com[:/]}
slug=${slug%.git}
slug=$(printf '%s' "$slug" | tr '[:upper:]' '[:lower:]')

IMAGE="ghcr.io/${slug}/preview:${TAG}"

env_args=()
if [[ -f "$ENV_FILE" ]]; then
  echo "Loading env vars from ${ENV_FILE}"
  env_args+=(--env-file "$ENV_FILE")
else
  echo "Warning: ${ENV_FILE} not found; starting without it" >&2
fi

echo "Pulling ${IMAGE}"
docker pull "$IMAGE"

if docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
  docker rm -f "$CONTAINER_NAME" >/dev/null
fi

echo "Starting preview on http://localhost:${PORT} (Ctrl-C to stop)"
exec docker run --rm -it \
  --name "$CONTAINER_NAME" \
  -p "${PORT}:3000" \
  "${env_args[@]}" \
  "$IMAGE"
