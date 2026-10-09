# Postgres sobre Alpine con pgvector (F10.8, addendum de ADR-020).
#
# Imagen propia y no la oficial `pgvector/pgvector`: esa solo existe sobre
# Debian, y pasar los datos de prod de Alpine (musl) a Debian (glibc) cambia
# el orden de los textos —las collations— y obliga a reindexar la base con
# respaldo y ventana. Sobre Alpine, el directorio de datos es el mismo:
# cambiar de imagen es recrear el contenedor, nada más.
#
# Las dos versiones de abajo son la ÚNICA fuente del tag que publica
# release.yml (`presencia-postgres:pg<PG>-pgvector<PGVECTOR>`), y CI exige
# que el default de docker-compose.yml diga lo mismo. Subir una es un tag
# nuevo: nunca se reescribe uno publicado, así que un deploy normal de la app
# no ve una base distinta, y siempre se puede volver al tag anterior.
#
# CI la construye y la prueba en cada PR: la máquina de Jose no tiene Docker.

# Fija la versión menor, no `17-alpine`: una actualización de Postgres es una
# decisión, no algo que llegue solo con el siguiente merge.
ARG PG_VERSION=17.10
FROM postgres:${PG_VERSION}-alpine

ARG PGVECTOR_VERSION=0.8.7

# - `with_llvm=no`: la imagen de Postgres está compilada con JIT, y PGXS
#   querría generar bitcode con un clang de la misma versión que su LLVM.
#   pgvector no lo necesita.
# - `OPTFLAGS=""`: sin `-march=native`, que ataría el binario al procesador
#   del runner y podría reventar con "illegal instruction" en el VPS.
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
