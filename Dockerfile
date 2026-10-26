# CES platform image — Muster portal (web) and muster-api (api).
# Build targets:  api  (Node 20, runs migrations then the API)
#                 web  (nginx serving the built portal, proxying /api and /auth)
# Used by deploy/docker-compose.yml. Aavya, 2026-10-26 (DEP-01).

FROM node:20-bookworm-slim AS build
RUN apt-get update \
 && apt-get install -y --no-install-recommends postgresql-client openssl ca-certificates python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . .
# Order matters: muster-api links ces-shared and ces-tenant as file: dependencies.
RUN cd ces-tenant && npm ci --no-audit --no-fund && npm run build
RUN npm ci --workspace ces-shared --no-audit --no-fund && npm run build -w ces-shared
# The portal calls the API on the same host ('/api'); nginx forwards it.
RUN cd ces-muster && npm ci --no-audit --no-fund && VITE_MUSTER_API_URL=/api npx vite build
RUN cd ces-muster/muster-api && npm ci --no-audit --no-fund && npx prisma generate

FROM build AS api
RUN mkdir -p /data/pipeline /data/tenants /output \
 && sed -i 's/\r$//' docker/*.sh \
 && chmod +x docker/*.sh
EXPOSE 4000
CMD ["/app/docker/api-entrypoint.sh"]

FROM nginx:1.27-alpine AS web
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/ces-muster/dist /usr/share/nginx/html
EXPOSE 80
