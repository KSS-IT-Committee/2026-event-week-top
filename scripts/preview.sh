#!/usr/bin/env bash
set -euo pipefail

PROJECT="top-preview"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_FILE="${REPO_DIR}/docker-compose.preview.yml"

remote_url=$(git -C "$REPO_DIR" remote get-url origin)
case "$remote_url" in
  https://github.com/*)
    slug=${remote_url#https://github.com/}
    ;;
  git@github.com:*)
    slug=${remote_url#git@github.com:}
    ;;
  ssh://git@github.com/*)
    slug=${remote_url#ssh://git@github.com/}
    ;;
  *)
    echo "Error: origin remote is not a supported GitHub URL: $remote_url" >&2
    echo "Expected formats: https://github.com/<owner>/<repo>[.git], git@github.com:<owner>/<repo>[.git], ssh://git@github.com/<owner>/<repo>[.git]" >&2
    exit 1
    ;;
esac
slug=${slug%.git}
slug=$(printf '%s' "$slug" | tr '[:upper:]' '[:lower:]')

export IMAGE_SLUG="$slug"

if [ "$#" -ge 1 ]; then
  # A tag was given: pull the published preview image (e.g. pr-123, sha-abc, latest).
  TAG="$1"
  IMAGE="ghcr.io/${slug}/preview:${TAG}"
  echo "Pulling ${IMAGE}"
  docker pull "$IMAGE"
else
  # No tag: build the image from the current working tree (local preview).
  TAG="local"
  IMAGE="ghcr.io/${slug}/preview:${TAG}"
  echo "Building ${IMAGE} from ${REPO_DIR}"
  docker build -t "$IMAGE" "$REPO_DIR"
fi

export TAG

cleanup() {
  docker compose -p "$PROJECT" -f "$COMPOSE_FILE" down --remove-orphans >/dev/null || true
}
trap cleanup EXIT INT TERM

echo "Starting preview on http://localhost:3000 (Ctrl-C to stop)"
docker compose -p "$PROJECT" -f "$COMPOSE_FILE" up --remove-orphans
