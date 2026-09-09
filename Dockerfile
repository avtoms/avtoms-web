# Next.js standalone production image. Build context = avtoms-web/.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Public API base is baked at build time (NEXT_PUBLIC_*). CI passes the prod gateway URL,
# e.g. https://api.auto-garaj.com. Empty default = same-origin (dev/local).
ARG NEXT_PUBLIC_API_BASE_URL=""
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Server-side (SSR) fetches go to the gateway over the internal Docker network.
ENV API_BASE_URL=http://gateway:8080
COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
# The runtime never uses a package manager — it runs `node server.js` and nothing else.
# npm ships its own dependency tree (tar among them) which keeps turning up in image scans,
# and an attacker who lands code execution in here should not find a tool that fetches and
# installs more of it. Incident 2026-09-09.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx \
           /usr/local/lib/node_modules/corepack /usr/local/bin/corepack /opt/yarn* 2>/dev/null || true

EXPOSE 3000
CMD ["node", "server.js"]
