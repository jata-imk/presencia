# ADR-022 · Un solo motor de métricas: la fórmula vive fuera de los módulos

**Decisión:** toda conclusión derivada de `post_metrics` —promedios, "+%", rachas, cadencia— se calcula en un único módulo (`apps/api/src/metrics/`, con la aritmética pura en `engagement.ts`) que no pertenece a ninguna pantalla. Ritmo lo consume primero y Analíticas después; ninguno de los dos calcula lo suyo. El motor devuelve números y un `modo`, nunca copy ni formato.

Con la fórmula vienen cuatro reglas, y son parte de la decisión, no detalles de implementación:

1. **`NULL` no entra al promedio.** Un post cuyos `likes`, `comments` y `shares` son los tres nulos queda fuera de toda agregación. Los nulos individuales se saltan; nunca se traducen a `0`.
2. **Una sola base por red y por ventana.** Si todos los posts con datos traen `reach`, la base es la tasa (`interacciones / reach`); si a uno le falta, la red entera se calcula en interacciones absolutas. La base elegida viaja en la respuesta.
3. **Edad de referencia de 24 h (±6 h).** De la serie de cada post se elige el snapshot tomado más cerca de sus primeras 24 horas de vida. Los posts que no la cumplieron todavía no entran; los que solo tienen mediciones fuera de la tolerancia, tampoco.
4. **Umbral y herencia.** Un "+%" se publica con N ≥ 5 en el grupo y N ≥ 10 del usuario en esa red. Se calcula primero por franja horaria (8 grupos de 3 h) y luego por día×franja donde haya muestra; la celda fina que no llega hereda el lift de su franja y queda marcada como heredada.

**Razón:** las cuatro reglas son la diferencia entre un número y una mentira con formato de número, y las cuatro se pueden incumplir de maneras que nadie nota.

- **Dos módulos con la misma fórmula divergen.** Ritmo ("qué hacer") y Analíticas ("qué pasó") son vistas opuestas de la misma materia prima. Si cada uno agrega por su cuenta, el día que alguien ajuste el filtrado de nulos en uno, el otro se queda viejo: Ritmo diría "+18%" y Analíticas "+12%" para exactamente lo mismo, los dos con cara de dato, y no habría forma de saber cuál está mal. Es el modo de falla clásico de la lógica duplicada, y acá el costo no es un bug de render: es que el producto se contradiga sobre su propio diferenciador.
- **`NULL ≠ 0` es inútil si solo se respeta al guardar.** ADR-021 ya lo declaró para la escritura. Un `AVG()` que mezcle ausencias con ceros lo deshace en la lectura, y el resultado es exactamente el que ese ADR describe: le dice al usuario que su mejor horario es el peor. La regla tiene que vivir donde se promedia.
- **La base mixta produce un número sin unidad.** Promediar tasas con conteos no falla ni avisa; da un número plausible. Y quedarse solo con los posts que traen `reach` sería peor: cambiaría la muestra según la red y la hora, que es justo la dimensión que se está midiendo.
- **Sin edad de referencia se mide el calendario, no el horario.** El último snapshot de un post de ayer y el de uno de hace tres semanas no miden lo mismo: el segundo tuvo veinte días más para acumular. Compararlos concluye que publicar hace tres semanas fue mejor idea.
- **Sin herencia, el "+%" no aparece nunca.** La rejilla es de 7 días × 8 franjas = 56 celdas. Pedirle N ≥ 5 a cada una exige 280 publicaciones dentro de una ventana de 30 días: diez diarias. El DoD de F9 promete que el "+%" aparece pasado el umbral, y con granularidad fija esa promesa sería inalcanzable por aritmética. Calcular primero por franja lo vuelve alcanzable con ~40 publicaciones, y marcar la celda como heredada mantiene la honestidad: la UI dice de dónde salió el número.

El umbral de 5 no es nuevo: es el mismo que se fijó para los hallazgos de Analíticas el 2026-09-18. Dos umbrales distintos para la misma pregunta ("¿alcanza la muestra?") serían dos respuestas distintas sobre el mismo dato.

**Descartado:**

- **Las queries dentro del servicio de Ritmo**, extrayéndolas cuando llegue Analíticas. Es más rápido hoy y es exactamente el escenario que la decisión de producto del 2026-09-18 pidió evitar por escrito, antes de que existiera el código. Extraer después significa hacerlo con dos consumidores vivos y un comportamiento que ya nadie recuerda por qué es así.
- **Construir ya las tres unidades de análisis de Analíticas** (por post, por red, por concepto multi-red). Es infra sin consumidor: nadie la ejercita, nada la valida y el primer uso real la va a cambiar. Lo que se fija ahora es la **frontera** —dónde vive la fórmula— no el catálogo de agregaciones.
- **Vista materializada o tabla de agregados.** La ventana es de 30 días y las filas por usuario son decenas: la query en vivo cuesta milisegundos. Un agregado precalculado agrega una cosa que puede quedar rancia y otra que hay que invalidar, sin resolver ningún problema que exista.
- **`AVG()` directo en SQL sobre las cinco columnas.** Tentador y corto. Postgres ignora los `NULL` en `AVG`, lo cual suena bien hasta que se nota que eso cambia el denominador por columna: el promedio de `likes` se calcula sobre otros posts que el de `shares`, y sumarlos después mezcla muestras distintas. La suma por post, y solo después el promedio, es la que mantiene una sola muestra.
- **Comparar redes entre sí.** Facebook e Instagram reportan alcance, YouTube y TikTok reportan vistas. Un "engagement" que las cruce compara peras con manzanas. El "+%" es siempre contra el propio promedio del usuario **dentro de una red**.

**Lo que esta decisión NO cubre:** de dónde salen los números (ADR-009, ADR-021), cómo se presentan, ni el cold-start — con qué se llena la pantalla cuando el motor devuelve `cold` o `poca`. Esa heurística genérica por vertical es contenido, no cálculo, y vive en su propio lugar. Tampoco el backfill del historial previo, que cambiaría cuán seguido el motor puede contestar `full` sin cambiar nada de la fórmula.

**Contexto:** F9, 2026-09-20. Sale de una decisión de producto tomada dos días antes: Analíticas muestra la evidencia, Ritmo muestra la decisión, y las dos hablan del mismo número. El motor nace sin pantalla y con su consumidor a un PR de distancia, que es la única ventana en la que esta frontera se puede trazar gratis. Los cuatro modos que devuelve (`cold`, `poca`, `full`, `no_reporta`) son estados distintos del mundo y no grados de un mismo vacío: `no_reporta` —LinkedIn personal, X— es un hecho sobre la red, y decirle ahí al usuario "seguí publicando para desbloquear tus horarios" sería prometerle algo que nunca va a llegar.

## Addendum (2026-11-21, F12) — Analíticas: un solo análisis, totales de hoy y cambios a 24 h

**Decisión:** Analíticas llega como segundo consumidor y el motor suma **una sola operación**, `MetricsEngineService.analizar()`. Hace tres lecturas, sin importar el periodo: las cards publicadas, el último número de cada métrica y los puntos de 24 h. De su resultado salen los cuatro endpoints de `apps/api/src/analiticas/` (`resumen`, `redes`, `publicaciones` y `publicaciones/:cardId`); ninguno calcula por su cuenta. La aritmética vive pura en `metrics/analisis.ts`, al lado de `engagement.ts`. El detalle de una publicación usa `detalle()`, que reutiliza las mismas lecturas y la misma ventana de referencia, así que su "sobre tu promedio" es el mismo número que el de la tabla.

Las unidades que el cuerpo del ADR difirió ("infra sin consumidor") se construyen ahora porque ya hay pantalla que las valida. Lo hacen como rebanadas del mismo análisis, no como agregaciones paralelas:

- **por publicación:** estado, últimos números y lift;
- **por red:** contexto, totales, engagement y tendencia;
- **por concepto:** `groupId` viaja en cada publicación, así que la lente del PR 8 no necesita otra lectura.

Las reglas nuevas, que son parte de la decisión:

1. **Los totales son lo que ves hoy: el último número que la red dio de cada métrica, columna por columna** (`ultimosNumeros`, `array_agg … filter (where col is not null)`). Se toma por columna y no "el último snapshot" porque un bucket nuevo con `null` en comentarios no borra el número que la red dio antes. Es la regla del `coalesce` de la ingesta, llevada a lo largo de la serie. "Medido hace" es el `captured_at` más reciente, traiga números o no.
2. **Los cambios "vs periodo anterior" se miden solo a 24 h, con las dos ventanas corridas 24 h**: `[ahora − P − 24 h, ahora − 24 h]` contra `[ahora − 2P − 24 h, ahora − P − 24 h]`.
   - Así todo lo que entra ya cumplió la edad de referencia, y una publicación de ayer no tira el número hacia abajo por no haber terminado de acumular.
   - Un cambio se calla (`null`, "Sin periodo anterior para comparar") si alguna de las dos ventanas tiene menos de 5 publicaciones con ese número. Es el mismo N del grupo.
   - Alcance e interacciones se expresan como porcentaje de la suma.
   - El engagement se expresa como diferencia absoluta en su unidad: puntos con `tasa`, interacciones por publicación con `interacciones`.
   - Publicaciones es un conteo: compara el periodo contra el anterior sin 24 h, y da `null` si el anterior no tuvo ninguna.
3. **Sin tasa cruzada entre redes.**
   - Con "Todas las redes", el engagement es una lista por red, nunca un número.
   - Las interacciones sí se suman entre redes, porque son conteos de lo mismo.
   - El alcance suma solo las redes que reportaron `reach` en el periodo, y la respuesta dice cuáles. El diseño mezclaba las vistas de TikTok en ese número; se decidió con Jose que no.
4. **La ventana de referencia ("tu promedio en esa red") es `max(P, 30)` días, terminando hoy.** Ahí se cuentan los umbrales (N ≥ 10 en la red para publicar un lift).
   - Con 30 días es la ventana de Ritmo, y la base, la muestra y el promedio coinciden **por construcción**: los dos llaman `valoresDeRed` + `promedioDe` de `engagement.ts`, extraídos en este PR de lo que antes hacían juntos `horariosCon` y `calcularHorarios`.
   - Hay una diferencia deliberada. Ritmo también cae a `poca` cuando ninguna franja llega a 5, porque su "+%" es por franja. Analíticas solo necesita el promedio de la red (`muestra = suficiente` con N ≥ 10).
   - Los hallazgos (PR 8) miran 90 días.
5. **El engagement mostrado es el nivel de hoy:** el promedio por publicación de `valorDe(últimos números)`, con la base de la red. Su cambio sale de los puntos de 24 h (regla 2).
6. **El lift es `valorDe(punto de 24 h) / promedio − 1`**, en porcentaje entero, solo con `muestra = suficiente`. Una publicación sin punto de 24 h (menos de 18 h de vida, o un hueco de ingesta) no tiene lift.
7. **El estado de una publicación se decide en este orden:**

   | Estado                        | Cuándo                                                                                      |
   | ----------------------------- | ------------------------------------------------------------------------------------------- |
   | `sin_medicion`                | No tiene `platform_post_id`                                                                 |
   | `medida`                      | Tiene un número de cualquiera de las cinco métricas                                         |
   | `no_reporta`                  | Su red no reporta. Pasa aunque tenga dos horas: un LinkedIn personal nunca está "en camino" |
   | `no_reporta` / `sin_medicion` | Cumplió 24 h: `no_reporta` si se midió y vino vacía, `sin_medicion` si nunca se midió       |
   | `en_camino`                   | Ninguno de los anteriores                                                                   |

8. **La tendencia de "Por red" se arma por tramos iguales del periodo:** 7 de 1 día, 5 de 6 días o 9 de 10 días. No se usan semanas de calendario, porque una semana partida en la orilla dibujaría una caída que no pasó.
9. **`ultimaMedicion`** mira solo publicaciones de 30 días o menos, que son las que la ingesta sigue midiendo (`frescura.ts`).

**Vistas de TikTok y YouTube.** No hay columna `views`, y `impressions` no se presenta como "vistas". El 2026-11-21 no había una sola fila de TikTok ni de YouTube en dev ni en prod, y ningún adapter lee `views` ni `plays`. Una red sin `reach` sale con alcance "No disponible", y sus impresiones crudas solo se ven en el detalle. Se revisa con la primera fila real: Upload-Post manda `primary_impressions_field` dentro de `raw`.

**Un bug de Ritmo que salió aquí.** `postsComparables` ordenaba solo por la distancia a las 24 h. Con buckets de 6 h son comunes dos mediciones a la misma distancia (a las 21 h y a las 27 h). Sin desempate ganaba la que Postgres devolviera primero, y eso depende del plan: la misma publicación salía con +56% en la tabla y +55% en su detalle. Ahora gana la posterior, que es la que ya cumplió la edad.

**Descartado:**

- **Un endpoint por sección con su propia query.** Cada uno armaría su versión del periodo y del promedio, que es justo la divergencia que este ADR existe para evitar.
- **Delta sobre los totales de hoy.** Una publicación de hace seis semanas siempre le ganaría a una de ayer (el argumento de la regla 3 del cuerpo).
- **Delta con las ventanas sin correr.** Las publicaciones de menos de 24 h saldrían del periodo actual y no del anterior, así que el cambio sesgaría siempre hacia abajo justo en el periodo de 7 días.
- **Mostrar el motivo crudo de `raw`.** Viene del proveedor, a veces en inglés. La pantalla escribe el porqué a partir del estado y la red.
- **Índices nuevos.** Con ~4 mil filas en dev las dos lecturas nuevas corren en milisegundos con seq scan, y a escala el índice único de `post_metrics` ya empieza por `user_id`. Sin migración.

**Contexto:** F12 PR 6, 2026-11-21. El diseño "Presencia Analytics Overview" se leyó completo. Además de las vistas, se desviaba del lore doc en otro punto: el hallazgo de día de la semana iba sin red y en presente. Manda el lore doc, y queda para el PR 8.
