# One Dockerfile, one image per service (targets: pendulum, gateway, ui). See DECISIONS D9, D25.
# Debian-based Node, not Alpine: the UI build uses native binaries that target glibc.

FROM node:24-slim AS deps
WORKDIR /app
# Manifests first, so dependencies are cached until a package.json or the lockfile changes.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/pendulum/package.json packages/pendulum/
COPY packages/gateway/package.json packages/gateway/
COPY packages/ui/package.json packages/ui/
RUN npm ci --no-audit --no-fund

FROM deps AS source
COPY tsconfig.base.json tsconfig.json ./
COPY packages packages

# Servers run their TypeScript directly with tsx: no build step (DECISIONS D19).
FROM source AS pendulum
CMD ["node", "--import", "tsx", "packages/pendulum/src/main.ts"]

FROM source AS gateway
EXPOSE 8080
CMD ["node", "--import", "tsx", "packages/gateway/src/main.ts"]

FROM source AS ui-build
# The browser calls the gateway from the host machine, so the URL is the host-side one.
ARG VITE_GATEWAY_URL=http://localhost:8080
ENV VITE_GATEWAY_URL=$VITE_GATEWAY_URL
RUN npm run build -w @pendulums/ui

FROM nginx:1.29-alpine AS ui
COPY --from=ui-build /app/packages/ui/dist /usr/share/nginx/html
