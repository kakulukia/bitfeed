#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
name="bitfeed-server-test-$$"

cleanup() {
  container stop "$name" >/dev/null 2>&1 || true
  container delete "$name" >/dev/null 2>&1 || true
}

trap cleanup EXIT INT TERM

container build --target build --tag bitfeed-server:test-build "$root/server"
container create --name "$name" --workdir /app --env MIX_ENV=test --entrypoint sleep bitfeed-server:test-build 600 >/dev/null
container start "$name" >/dev/null
container cp "$root/server/test" "$name:/app/test"
container exec "$name" mix test --no-start "$@"
