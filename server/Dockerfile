FROM elixir:1.18.4-otp-27-slim@sha256:09b37446f1b24a280890c4b294eec6a53ba2501a2289959b483d849035e1053c AS base
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*

FROM base AS build
# Keep Erlang JIT compatible with emulated image builds.
ENV ERL_AFLAGS="+JMsingle true"

ENV MIX_ENV=prod
ENV RELEASE_NODE=bitfeed
WORKDIR /app
RUN mix local.hex --force && mix local.rebar --force
COPY mix.exs mix.lock ./
COPY bitcoinex ./bitcoinex
RUN mix deps.get --only prod && mix deps.compile
COPY lib ./lib
COPY config ./config
COPY log ./log
RUN mix release

FROM build AS test
ENV MIX_ENV=test
COPY test ./test
RUN mix test --no-start test/mempool_test.exs test/block_data_test.exs test/http_security_test.exs

FROM base AS runtime
ENV RELEASE_NODE=bitfeed
WORKDIR /app
COPY --from=build --chown=1000:1000 /app/_build/prod/rel/prod ./
COPY LICENSE /usr/share/licenses/bitfeed/LICENSE
RUN mkdir data && chown 1000:1000 data
USER 1000:1000
EXPOSE 8315
CMD ["/app/bin/prod", "start"]
