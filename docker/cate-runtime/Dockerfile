# A minimal image for the self-contained Linux runtime tarball.
# Build with the tarball directory as context:
#
#   docker build \
#     --build-arg RUNTIME_TARBALL=opencate-runtime-<version>-linux-x64.tgz \
#     -f docker/cate-runtime/Dockerfile \
#     -t cate/runtime:<version>-linux-x64 dist-runtime
#
# The bundled Node is the runtime boundary; the base image only supplies the
# POSIX userspace and /bin/sh used by the container transport's probe.
FROM debian:bookworm-slim

ARG RUNTIME_TARBALL
COPY ${RUNTIME_TARBALL} /tmp/opencate-runtime.tgz

RUN mkdir -p /opt/cate/runtime \
  && tar -xzf /tmp/opencate-runtime.tgz -C /opt/cate \
  && test -f /opt/cate/runtime.cjs \
  && mv /opt/cate/runtime.cjs /opt/cate/runtime/runtime.cjs \
  && chmod +x /opt/cate/runtime/bin/node /opt/cate/runtime/bin/rg \
  && test -x /opt/cate/runtime/bin/node \
  && test -f /opt/cate/runtime/runtime.cjs \
  && rm -f /tmp/opencate-runtime.tgz

WORKDIR /workspace
ENTRYPOINT ["/opt/cate/runtime/bin/node", "/opt/cate/runtime/runtime.cjs"]
