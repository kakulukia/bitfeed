#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
name="bitfeed-server-test-$$"

cleanup() {
  container stop "$name" >/dev/null 2>&1 || true
  container delete "$name" >/dev/null 2>&1 || true
}

trap cleanup EXIT INT TERM

container create --name "$name" --workdir /app elixir:1.11-slim sleep 600 >/dev/null
container start "$name" >/dev/null
container cp "$root/server" "$name:/app"

container exec "$name" sh -lc '
  mix local.hex --force &&
  mix local.rebar --force &&
  cd /app/server &&
  mix deps.get &&
  mix test "$@"
' sh "$@"
