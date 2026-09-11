# Imagen única para los dos procesos de Presencia: la API (`main.ts`) y el
# worker de pg-boss (`worker.ts`). Misma imagen, distinto comando — ADR-008.
#
# El SPA de apps/web viaja ADENTRO de esta imagen y lo sirve el mismo proceso
# de Express: apps/web no tiene variables de entorno y llama a la API con
# rutas relativas (`/api/...`), así que web y API tienen que ser same-origin
# (ADR-020).

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

# --- deps: solo los manifests, para que el layer de instalación se cachee
# mientras no cambie el lockfile.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
# --ignore-scripts: el `prepare` de la raíz corre husky, que necesita .git y
# no pinta nada en una imagen.
RUN pnpm install --frozen-lockfile --ignore-scripts

# --- build: turbo construye packages/shared primero (es dependencia de build
# tanto de api como de web) y después los dos apps.
FROM deps AS build
COPY . .
RUN pnpm build

# --- prune: vuelve a resolver node_modules sin devDependencies. No toca los
# dist/ que acaba de producir el stage anterior.
FROM build AS prune
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

# --- runtime
FROM base AS runtime
ENV NODE_ENV=production

# pg_dump para el backup diario (ADR-011). La versión del cliente tiene que
# coincidir con el server: el compose corre postgres:17-alpine.
RUN apk add --no-cache postgresql17-client

# node_modules de pnpm es un árbol de symlinks hacia la store de la raíz, así
# que el orden importa: primero la raíz, después cada proyecto.
COPY --from=prune /app/node_modules ./node_modules
COPY --from=prune /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=prune /app/packages/shared/package.json ./packages/shared/
COPY --from=prune /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=prune /app/packages/shared/dist ./packages/shared/dist
COPY --from=prune /app/apps/api/package.json ./apps/api/
COPY --from=prune /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=prune /app/apps/api/dist ./apps/api/dist
# El build del SPA. Lo sirve main.ts; el worker lo ignora.
COPY --from=prune /app/apps/web/dist ./apps/web/dist

USER node
WORKDIR /app/apps/api

# El default es la API. El servicio `worker` del compose lo sobreescribe con
# `node dist/worker.js` — misma imagen, distinto entrypoint (ADR-008).
CMD ["node", "dist/main.js"]
