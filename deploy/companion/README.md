# Cate companion deployment

These files describe a Linux host deployment for the static companion and the
self-hosted relay. They are operator examples, not a hosted service or a
replacement for a public identity/access-control provider.

## Layout

- `relay.env.example`: required relay environment. Keep the relay on
  `127.0.0.1`; Caddy is the HTTPS boundary.
- `cate-relay.service.example`: systemd unit with a dedicated service user and
  filesystem/network hardening.
- `Caddyfile.example`: HTTPS static hosting plus reverse proxy for `/health` and already-issued `/v1/channels/*` paths only.

## Install

1. Put the Cate checkout, including `package.json` and its installed Bun
   dependencies, at `/opt/cate`. Install Bun and Caddy from the operator's
   trusted distribution channels.
2. Create the service identity and directories:

   ```bash
   sudo useradd --system --home-dir /var/lib/cate-relay --shell /usr/sbin/nologin cate-relay
   sudo install -d -o root -g cate-relay -m 0750 /etc/cate
   sudo install -d -o root -g cate-relay -m 0755 /srv/cate-companion
   ```

3. Build and extract the versioned companion asset. The tarball contains the
   files at its root, so do not use `--strip-components`:

   ```bash
   npm run package:companion
   sudo tar -xzf release/cate-companion-web-<version>.tgz -C /srv/cate-companion
   ```

4. Install the environment and unit with explicit non-executable modes, edit
   the hostname/origin, then start the relay:

   ```bash
   sudo install -o root -g cate-relay -m 0640 relay.env.example /etc/cate/companion-relay.env
   sudo install -o root -g root -m 0644 cate-relay.service.example /etc/systemd/system/cate-relay.service
   sudo systemctl daemon-reload
   sudo systemctl enable --now cate-relay.service
   ```

5. Copy `Caddyfile.example`, replace the site name and document root if needed,
   validate it, and reload Caddy. Confirm the public health endpoint with:

   ```bash
   curl --fail --silent --show-error https://companion.example.com/health
   ```

Never publish port `8787` directly. The relay's per-channel bearer is still
required for channel operations; `/v1/channels` is intentionally reachable only
through the operator's chosen proxy/access boundary. The web client currently
does not carry a global proxy secret, so do not add a static `Authorization`
requirement in front of the relay without extending the invitation contract.

## Rotation and reconnect

- Changing `CATE_RELAY_CORS_ORIGIN` requires editing the environment and
  restarting `cate-relay.service`; this also discards in-memory channels, so
  pair the companion again.
- Reloading Caddy after a proxy policy/certificate change uses the Caddy reload
  path and does not require changing relay channel bearers.
- Pairing/channel tokens are short-lived and revocable. On suspected exposure,
  revoke the device in Cate and issue a new pairing instead of reusing a QR.
- Validate the local boundary before deployment with
  `npm run test:companion:proxy`. That fixture covers TLS, proxy authentication,
  token rotation, process restart and encrypted round-trips; it does not prove
  public DNS, ACME, non-loopback reconnect or the operator's identity provider.
