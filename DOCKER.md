# Running Bitfeed with Docker

## Images

Bitfeed Remix images are prepared by the manually triggered `remix-images.yml` workflow. They are not published yet. Release images use commit tags and must be pinned by digest in the Umbrel package. See [UMBREL.md](UMBREL.md).

Alternatively, build your own containers from source using the provided Dockerfiles:

#### Front end client
```shell
cd client
docker build . -t bitfeed/client:<version>
```

#### API Server
```shell
cd server
docker build . -t bitfeed/server:<version>
```

## Orchestration

Check out [`docker-compose.yml`](https://github.com/bitfeed-project/bitfeed/blob/master/docker-compose.yml) for an example configuration, which exposes the front end client on port 3000, and connects to a locally running Bitcoin node.