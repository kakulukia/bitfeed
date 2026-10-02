#!/usr/bin/env bash
set -euo pipefail

source_tar="${1:-/home/umbrel/bitfeed-server-src.tar.gz}"
build_dir="${BITFEED_BUILD_DIR:-/home/umbrel/bitfeed-server-build}"
bitcoin_container="${BITCOIN_CONTAINER:-bitcoin_app_1}"
name="${BITFEED_CONTAINER:-bitfeed-server}"
port="${BITFEED_PORT:-5001}"

sudo rm -rf "$build_dir"
mkdir -p "$build_dir"
tar -xzf "$source_tar" -C "$build_dir"
sudo docker build -t bitfeed-server:umbrel "$build_dir"

network="$(
  sudo docker inspect "$bitcoin_container" \
    --format '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}}{{"\n"}}{{end}}' \
    | head -n 1
)"

cookie="$(
  sudo docker exec "$bitcoin_container" sh -lc '
    for path in /data/.bitcoin/.cookie /bitcoin/.bitcoin/.cookie /home/bitcoin/.bitcoin/.cookie /data/bitcoin/.cookie; do
      [ -f "$path" ] && printf "%s\n" "$path" && exit 0
    done
    find / -name .cookie 2>/dev/null | head -n 1
  '
)"

if [ -z "$network" ] || [ -z "$cookie" ]; then
  echo "Could not find bitcoin docker network or RPC cookie path" >&2
  exit 1
fi

sudo docker rm -f "$name" >/dev/null 2>&1 || true

sudo docker run -d \
  --name "$name" \
  --restart unless-stopped \
  --network "$network" \
  --volumes-from "$bitcoin_container":ro \
  -p "$port:$port" \
  -e PORT="$port" \
  -e BITCOIN_HOST="$bitcoin_container" \
  -e BITCOIN_RPC_PORT=8332 \
  -e BITCOIN_RPC_COOKIE="$cookie" \
  -e BITCOIN_ZMQ_RAWBLOCK_PORT=28332 \
  -e BITCOIN_ZMQ_RAWTX_PORT=28333 \
  -e BITCOIN_ZMQ_SEQUENCE_PORT=28335 \
  -e LOG_LEVEL=info \
  bitfeed-server:umbrel

sudo docker logs --tail 80 "$name"
