# Postgres 17 sobre Alpine con pgvector (F10.8, addendum de ADR-011).
#
# Imagen propia y no la oficial `pgvector/pgvector`: esa solo existe sobre
# Debian, y pasar los datos de prod de Alpine (musl) a Debian (glibc) cambia
# el orden de los textos —las collations— y obliga a reindexar la base con
# respaldo y ventana. Sobre la misma Alpine, el directorio de datos es el
# mismo: cambiar de imagen es recrear el contenedor, nada más.
#
# La publica release.yml en GHCR (presencia-postgres) y CI la construye y la
# prueba en cada PR: la máquina de Jose no tiene Docker.
FROM postgres:17-alpine

ARG PGVECTOR_VERSION=0.8.7

# - `with_llvm=no`: la imagen de Postgres está compilada con JIT, y PGXS
#   querría generar bitcode con un clang de la misma versión que su LLVM.
#   pgvector no lo necesita.
# - `OPTFLAGS=""`: sin `-march=native`, que ataría el binario al procesador
#   del runner de CI y podría reventar con "illegal instruction" en el VPS.
# - Las herramientas de compilación se borran en la misma capa.
RUN apk add --no-cache --virtual .build-deps git build-base \
  && git clone --branch "v${PGVECTOR_VERSION}" --depth 1 \
    https://github.com/pgvector/pgvector.git /tmp/pgvector \
  && cd /tmp/pgvector \
  && make OPTFLAGS="" with_llvm=no \
  && make install with_llvm=no \
  && cd / \
  && rm -rf /tmp/pgvector \
  && apk del .build-deps
