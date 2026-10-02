# Bitfeed Remix on Umbrel

This repository contains a community-store draft for Bitfeed Remix, an independently maintained fork of Mononaut's Bitfeed. It is not an approved app in the official Umbrel App Store.

The store ID is `kakulukia`. The app ID is `kakulukia-bitfeed-remix`, displayed as **Bitfeed Remix**. Port `8316` is distinct from the original Bitfeed app's port `8314`. Both apps can use the same Umbrel Bitcoin Node. Remix has its own block cache, and browser settings are separate because the two apps have different origins.

## Build and test

From the repository root:

```sh
docker build --target test server
docker buildx build --platform linux/amd64,linux/arm64 --tag bitfeed-remix-client:local client
docker buildx build --platform linux/amd64,linux/arm64 --tag bitfeed-remix-server:local server
```

Local mise tasks use the same Dockerfile build stage through `server/scripts/test-container.sh`. To run the checked regression and security cases, use `server/scripts/test-container.sh test/mempool_test.exs test/block_data_test.exs test/http_security_test.exs`. The default invocation keeps selecting the full suite; its pre-existing `ZPUB` sample still references an absent module and has not been changed.

The `test` stage runs the existing mempool and block-cache regression tests and the release security checks without starting a Bitcoin connection. It does not run the unrelated legacy `ZPUB` sample test. Docker's image exporter needs `--push` for registry publication or an OCI output for a local multi-platform artifact.

The build stage sets `ERL_AFLAGS="+JMsingle true"`, following [Elixir's release guidance](https://github.com/elixir-lang/elixir/blob/v1.18.4/lib/mix/lib/mix/tasks/release.ex), so Erlang's JIT works during emulated builds. This setting is not applied to the runtime image.

The client uses Node 22 and Nginx's standard entrypoint. The server uses Elixir 1.18.4 with OTP 27. Both base-image indexes are pinned and provide AMD64 and ARM64. The API runs as UID/GID `1000:1000`; its persistent cache is `/app/data`.

## Prepare a public release

The compose file pins the publicly available AMD64/ARM64 images built from source commit `2dc9af02aeeb4d71b4e114f5d531c5734042d991`, using their commit tags and immutable registry index digests. After publication of the finalized store files, validation on an approved Umbrel is still required before announcing the release. For future image releases, repeat the checks below and use the new registry digests.

1. Resolve the two remaining Cowlib audit advisories described below, then review and authorize the source commit and its publication. Keep this fork-specific packaging separate from the existing upstream UI pull request when choosing the release branch.
2. Make `.github/workflows/remix-images.yml` available on the fork's default branch. It runs only through **Run workflow**, with no publication on ordinary pushes or tags. The `publish_images` option defaults to `false`; leave it unchecked for a build test. Tests and the dependency audit must pass in either mode.
3. After the test run and explicit release approval, run the workflow on the exact reviewed source commit with `publish_images` checked. It first runs server tests and `mix hex.audit`, then publishes `bitfeed-remix-client` and `bitfeed-remix-server` to GHCR with `sha-<full-commit>` tags.
4. Make both GHCR packages public. Verify anonymous registry access and both Linux architectures.
5. Copy each full `image:tag@sha256:digest` reference from the workflow summary into the community compose file. Do not substitute a per-architecture digest or reuse the local QA image digest for a rebuilt release.
6. Enable Issues on the fork before announcing public support and point `support` in the manifest to the working issue tracker.
7. Validate the final package in a current checkout of [getumbrel/umbrel-apps](https://github.com/getumbrel/umbrel-apps): copy the app directory there and run `npm ci` followed by `npm run lint:apps -- kakulukia-bitfeed-remix --check-images`.
8. Review and authorize publication of the finalized store files before installing it on a real Umbrel.

After the finalized package is published on this repository's default branch, add `https://github.com/kakulukia/bitfeed` in Umbrel's community app stores. Install **Bitfeed Remix** from the **Kakulukia App Store**.

## Runtime validation before release

Test on a disposable Umbrel or an explicitly approved device. Install Bitcoin Node first. Open Remix through Umbrel's authenticated app proxy, including HTTPS on umbrelOS 2. Check block and transaction loading, live WebSocket updates, keyboard navigation, watchlist, fullscreen, and optional price charts. Restart the app and verify that the cache is writable and preserved. Install the original Bitfeed alongside Remix to verify coexistence.

Container builds and a direct local frontend/API test do not validate Umbrel's login proxy, app lifecycle, storage initialization, or HTTPS routing. Those checks remain necessary before announcing compatibility with a specific umbrelOS version.

## Attribution and external services

Upstream software and original branding are by Mononaut, under the MIT license. Both runtime images include the original license notice. This fork's UI improvements are proposed upstream in [bitfeed-project/bitfeed#69](https://github.com/bitfeed-project/bitfeed/pull/69), which is also the manifest's current `submission` source reference. No Umbrel submission or approval is represented by that link.

The app uses the user's Bitcoin Node through Umbrel's exported RPC and ZMQ settings. The browser fetches exchange-rate data from `blockchain.info`, and optional charts use CoinGecko. These services receive the browser's IP address. No Docker socket, privileged mode, additional host directories, or unauthenticated app-proxy override is requested.

## Official App Store route

A community store makes the fork distributable; it does not automatically add the app to the official store. After public images and real Umbrel validation are available, prepare a separate submission to `getumbrel/umbrel-apps` and use that actual pull request as the submission reference. Umbrel reviews the app and prepares official icon/gallery assets. The existing upstream pull request remains linked for provenance.

## Dependency review

The preparation updates the affected HTTP stack within its existing version constraints: Finch 0.24.0, Mint 1.11.0, HPAX 1.1.0, Plug 1.20.3, Plug.Cowboy 2.9.0, Cowboy 2.19.0, and Cowlib 2.20.0. The unused Decimal dependency is removed. Existing address and transaction arithmetic is unchanged.

Hex still reports two advisories on the latest Cowlib release: `CVE-2026-43966` for structured-header encoding and `CVE-2026-43969` for cookie encoding. The current API does not call those encoders or set cookies, but a successful audit must not be claimed. The manual publication workflow acknowledges only `EEF-CVE-2026-43966` and `EEF-CVE-2026-43969` for the reviewed release. These findings remain visible in the audit output. All other advisories still block publication. The release security tests require Cowlib 2.20.0 and Cowboy 2.19.0, so dependency updates require a renewed review. Changes to the server HTTP options or RPC client also require reviewing this exception again. See [Cowlib's current advisory listing](https://hex.pm/packages/cowlib/advisories).

The release security checks exercise Cowboy's default response-header protection over a real local HTTP connection. They accept a valid structured header and reject a Cowlib-encoded CRLF payload before transmission. A bytecode import check also rejects direct uses of the affected `cow_cookie:cookie/1` encoder outside Cowlib itself. The checks support an application-specific review; they do not patch Cowlib or establish general absence of vulnerabilities.

The advisory author documents Cowboy 2.16.0 and later as a server-side mitigation for `CVE-2026-43966`. This fork locks Cowboy 2.19.0 and does not override `invalid_response_headers`. The affected cookie function builds outgoing client request headers; this application uses Finch/Mint for RPC. Any exception to the audit must be restricted to the reviewed advisory IDs and dependency versions, with the security checks still required. The exception applies only to the two documented advisory IDs and the reviewed dependency versions. Sources: [structured header advisory](https://cna.erlef.org/cves/CVE-2026-43966.html), [cookie encoder advisory](https://cna.erlef.org/cves/CVE-2026-43969.html).
