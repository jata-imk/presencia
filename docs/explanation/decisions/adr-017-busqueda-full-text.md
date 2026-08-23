# ADR-017 · Búsqueda: full-text de Postgres (tsvector `es_unaccent` + trigramas)

**Decisión:** la búsqueda global (⌘K) corre en Postgres, con dos mecanismos según qué se busca. Trigramas (`pg_trgm`) para nombres cortos —títulos de chat, nombres de carpeta— y full-text (`tsvector`) con una configuración propia `es_unaccent` para los cuerpos largos —mensajes y contenido de cards—. Endpoint único `GET /api/search?q=`, resultados **categorizados**.

**Razón:** cero infraestructura nueva. La DB ya está ahí, ya tiene RLS, y las extensiones que hacen falta (`unaccent`, `pg_trgm`) son _trusted_ desde PG13 — el owner las crea sin superusuario. Cualquier otra opción implica operar un servicio más para un producto pre-lanzamiento.

## Por qué dos mecanismos y no uno

No es lo mismo buscar un título de cuatro palabras que el cuerpo de una conversación.

| Campo                                         | Mecanismo                 | Por qué                                                                                                                         |
| --------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `chats.title`, `folders.name`                 | trigrama (`gin_trgm_ops`) | Strings cortos: importa tolerar typos y coincidencias parciales. Aplicar stemming a un título de cuatro palabras no aporta nada |
| `messages.parts`, `publication_cards.content` | tsvector FTS              | Texto largo en español: importa que "programar" encuentre "programando", y el ranking por densidad de términos                  |

Se usa el operador `<%` (`word_similarity`) y **no** `%`. `%` compara la query contra el título _entero_, así que una query corta contra un título largo casi nunca supera el umbral; `<%` la compara contra la mejor extensión de palabras dentro del target, que es exactamente el caso de uso de una paleta de comandos.

**Los scores no se normalizan entre sí.** `ts_rank_cd` y `word_similarity` viven en escalas distintas y mezclarlos sería inventar una equivalencia que no existe. Cada sección rankea internamente y los resultados se devuelven categorizados — que además es lo que pide el overview §5.

## Acentos: configuración propia, no `unaccent` suelto

El stemmer `spanish` **no quita acentos**: "adiós" y "adios" stemean distinto. En un producto en español mexicano eso no es un detalle.

```sql
CREATE TEXT SEARCH CONFIGURATION es_unaccent (COPY = spanish);
ALTER TEXT SEARCH CONFIGURATION es_unaccent
  ALTER MAPPING FOR hword, hword_part, word WITH unaccent, spanish_stem;
```

Se pasa el config **explícito** (`to_tsvector('es_unaccent', …)`) y nunca la variante de un argumento: esa depende de `default_text_search_config`, que es un parámetro de sesión, y por eso no es inmutable ni sirve en una columna generada.

Para los trigramas hace falta un `unaccent` inmutable — `unaccent(text)` es `STABLE` y un índice de expresión lo rechaza. El wrapper `f_unaccent` es el workaround que documenta el propio Postgres: fija el diccionario explícitamente, sin depender del `search_path` de la sesión.

## El texto vive en `jsonb`, no en columnas de texto

`messages.parts` guarda el shape `UIMessage` del AI SDK y `publication_cards.content` guarda `cardContentSchema`. No hay ninguna columna que indexar.

Extraer con `jsonb_array_elements` exigiría una **subquery**, y las columnas generadas no las admiten. `jsonb_path_query_array` sí: es inmutable y solo toca la propia fila.

```sql
to_tsvector('es_unaccent',
  jsonb_path_query_array("parts", '$[*] ? (@.type == "text").text')::text)
```

El `::text` deja `["hola", "mundo"]` con corchetes y comillas — no molesta: el parser de Postgres los trata como separadores. Como la columna es `STORED`, Postgres la calcula para las filas existentes al agregarla: **cero código de backfill**.

Para las cards, `cardContentSchema` es un `discriminatedUnion` de tres arquetipos con campos distintos (`caption` / `hook`+`script`+`caption` / `body`), así que se concatenan todos con `coalesce` y el que no aplica aporta `''`. Quedan fuera `imagePrompt` y `recordingNotes`: son instrucciones de producción, no el texto publicable que el usuario va a recordar.

## Las columnas derivadas NO entran a `schema.ts`

Extensiones, configuración de text search, la función y las columnas generadas no se expresan en el schema de Drizzle. Todo eso vive en la migración `0014`, **escrita a mano** y registrada en `meta/_journal.json` sin snapshot (mismo trato que `0008` y `0010`, y que las policies de RLS).

Las columnas `search_tsv` se referencian desde el repositorio con plantillas `sql` crudas. El motivo es concreto: drizzle-kit diffea contra el _snapshot_, no contra la DB viva, así que si nunca entran a un snapshot nunca las va a querer borrar. Declararlas a medias es la receta para que el próximo `generate` emita un `DROP COLUMN`.

## Detalles que muerden

- **`websearch_to_tsquery`, nunca `to_tsquery`.** El segundo lanza `syntax error` con input libre del usuario — un `&` suelto alcanza. El primero acepta comillas, `or` y `-`, y jamás tira.
- **`ts_headline` es caro.** Corre sobre las filas ya recortadas por el `LIMIT`, nunca sobre el conjunto completo de candidatos.
- **Mínimo de 2 caracteres, validado en el servidor** y no solo en el cliente: con una sola letra el trigrama devuelve medio workspace.
- **RLS aplica igual.** Los índices GIN son globales a la tabla, pero la política de tenant filtra después; hay un test en `rls.spec.ts` que lo confirma. `messages.user_id` está denormalizado justo para que la búsqueda en mensajes no necesite un join a `chats`.

## Descartado

- **Filtrar en el cliente sobre los stores.** Era la opción de cero backend, y para títulos de chat habría funcionado hoy. Pero no ve dentro de los mensajes —que es la mitad del valor— y deja de ser correcta apenas `GET /chats` se pagine.
- **`ILIKE '%q%'`.** No usa índice (el comodín inicial mata cualquier B-tree), no stemea y no tolera typos. Más simple de escribir y peor en las tres dimensiones que importan.
- **Embeddings / Meilisearch / Elastic.** Búsqueda semántica de verdad ("posts sobre productividad" encontrando algo que nunca dice esa palabra). Queda en el backlog: es otro servicio que operar —o un pipeline de embeddings que mantener— y la decisión se toma cuando haya volumen real que la justifique. El FTS de acá es el piso, no el techo.

## Atajos de teclado globales

Convención que estrena el ⌘K, escrita acá para no abrir un ADR entero por un keybinding: **un solo listener a `document` por atajo**, montado en el componente dueño de la superficie que abre. `preventDefault()` es obligatorio (Ctrl+K enfoca la omnibox en Chrome/Windows). Se ignoran `e.repeat` y `e.isComposing` (IME). **No** se filtra por "el foco está en un input": ⌘K tiene que abrir aunque estés escribiendo en el composer, es la convención universal de las paletas de comandos.
