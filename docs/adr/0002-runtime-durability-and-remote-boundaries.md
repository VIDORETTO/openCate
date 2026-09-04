# ADR 0002 — Runtime durability and remote expansion boundaries

**Status:** Accepted — 2026-08-29.

The runtime contract supports local, SSH, WSL, and an explicit container host;
PTYs remain ephemeral unless a terminal opts into tmux durability. The tmux
backend uses a stable openCate-owned session name, attaches through argv (never a
shell string), destroys the session on user close, and only detaches its client
when the daemon shuts down. It is available on POSIX runtime hosts where tmux
is installed; Windows fails closed with a clear error.

Container runtimes require a declared Docker/Podman image, an explicit single
workspace bind mount, a runtime root inside that mount, `--pull=never`, and a
secret/environment allowlist. The image must already contain
`/opt/cate/runtime/bin/node` and `/opt/cate/runtime/runtime.cjs`; openCate never
deletes or mutates the image and defaults the container network to `none`.

The companion protocol and a self-hosted opaque relay are now concrete seams:
read methods are enumerated and exclude terminal scrollback, approvals are
host-minted and one-shot, and relay frames contain ciphertext only. The relay
has no account model and binds to loopback by default; public deployment must
place it behind an authenticated TLS proxy. The loopback CATE_API bearer
endpoint is not promoted to the internet.

The repository now ships the transport-neutral companion SDK, P-256/HKDF/AES
frame crypto, a one-time host pairing registry, a desktop relay responder,
desktop QR/pairing UI, and a responsive companion-web shell. The browser
identity store keeps a non-extractable Web Crypto private key in IndexedDB;
native wrappers still need a platform Keychain/Keystore adapter. The relay is
therefore an exercised transport seam, not a claim that public remote
companion access is production-ready; deployment still requires an
authenticated TLS proxy and operational rotation/reconnect evidence.

These boundaries keep the shipped local/SSH/WSL behavior honest and prevent a
partial transport from implying process durability or remote access control it
does not provide. The deferred capabilities remain tracked in the product
backlog with these acceptance criteria.
