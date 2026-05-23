#!/usr/bin/env bash
set -euo pipefail

TAG="${1:-latest}"
PROJECT="top-preview"
COMPOSE_FILE="$(dirname "$0")/../docker-compose.preview.yml"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${REPO_ROOT}/.env.local"

remote_url=$(git -C "$REPO_ROOT" remote get-url origin)
slug=${remote_url#*github.com[:/]}
slug=${slug%.git}
slug=$(printf '%s' "$slug" | tr '[:upper:]' '[:lower:]')

export IMAGE_SLUG="$slug"
export TAG

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

cleanup() {
  docker compose -p "$PROJECT" -f "$COMPOSE_FILE" down --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

echo "Starting preview on http://localhost:${PORT} (Ctrl-C to stop)"
exec docker run --rm -it \
  --name "$CONTAINER_NAME" \
  -p "${PORT}:3000" \
  "${env_args[@]}" \
  "$IMAGE"
echo "Starting preview on http://localhost:3000 (Ctrl-C to stop)"
docker compose -p "$PROJECT" -f "$COMPOSE_FILE" up --remove-orphans
