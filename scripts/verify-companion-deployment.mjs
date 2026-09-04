/* global console */

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const deploymentRoot = path.join(repoRoot, 'deploy', 'companion')
const files = await Promise.all([
  fs.readFile(path.join(deploymentRoot, 'relay.env.example'), 'utf8'),
  fs.readFile(path.join(deploymentRoot, 'cate-relay.service.example'), 'utf8'),
  fs.readFile(path.join(deploymentRoot, 'Caddyfile.example'), 'utf8'),
  fs.readFile(path.join(deploymentRoot, 'README.md'), 'utf8'),
])
const [env, unit, caddyfile, readme] = files

assertContains(env, 'CATE_RELAY_HOST=127.0.0.1', 'loopback relay host')
assertContains(env, 'CATE_RELAY_PORT=8787', 'relay port')
assertContains(env, 'CATE_RELAY_CORS_ORIGIN=https://companion.example.com', 'explicit HTTPS CORS origin')
if (/CATE_RELAY_CORS_ORIGIN=\*/u.test(env)) throw new Error('deployment env must not use wildcard CORS')

for (const invariant of [
  'User=cate-relay',
  'Group=cate-relay',
  'EnvironmentFile=/etc/cate/companion-relay.env',
  'ExecStart=/usr/bin/env bun run companion:relay',
  'Restart=on-failure',
  'NoNewPrivileges=true',
  'ProtectSystem=strict',
  'ProtectHome=true',
  'RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX',
]) assertContains(unit, invariant, `systemd unit: ${invariant}`)
if (/\b(?:bash|sh)\s+-c\b/u.test(unit)) throw new Error('systemd unit must not invoke a shell command')

assertContains(caddyfile, '@channel-create path /v1/channels', 'blocked public channel creation route')
assertContains(caddyfile, 'respond "not-found" 404', 'channel creation denial')
assertContains(caddyfile, '@relay path /health /v1/channels/*', 'restricted public relay route')
if (caddyfile.includes('@relay path /health /v1/*')) throw new Error('Caddyfile exposes unbounded /v1/* route')
assertContains(caddyfile, 'reverse_proxy 127.0.0.1:8787', 'loopback reverse proxy')
assertContains(caddyfile, 'root * /srv/cate-companion', 'static companion root')
assertContains(readme, 'npm run test:companion:proxy', 'pre-deployment proxy smoke')

console.log('companion deployment: passed (env, systemd hardening, Caddy routes)')

function assertContains(text, value, label) {
  if (!text.includes(value)) throw new Error(`missing ${label}: ${value}`)
}
