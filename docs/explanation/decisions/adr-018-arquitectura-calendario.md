# ADR-018 · Calendario: vista sobre las cards, construida a mano

**Decisión:** el módulo Calendario (F7) no tiene motor propio ni librería de calendario. Es una **vista** sobre `publication_cards`: lee de un endpoint de rango nuevo (`GET /api/cards`), escribe con el mismo `POST /cards/:id/schedule` que usa el drawer de Chat, guarda su estado en la **URL**, renderiza las horas en la **zona del usuario** (no la del navegador), y **deriva** la agrupación multi-red en cada render en vez de persistirla. La grilla, el eje horario y el drag & drop se escriben a mano.

**Razón:** las tres decisiones que parecían de librería (calendario, fechas, drag) no son la misma decisión. Solo una se resuelve comprando.

## Sin librería de calendario

FullCalendar, react-big-calendar y Schedule-X traen su propio DOM y su propio CSS. Lo que pide el diseño aprobado no es un calendario de eventos genérico: es panel de borradores + barra de cadencia + grupos multi-red unidos por un border-left continuo + cap de 3 con chip "+N más" + popover de conflicto anclado a la celda. Cada una de esas se pelearía contra la librería, y "tokens, no hex" (AGENTS.md #2) obliga a reescribir su tema entero de todos modos.

Lo que se evita comprando es poco: la matriz de 5-6 semanas desde el lunes (`lib/calendar/grid.ts`) y la posición vertical de un bloque por su hora son ~120 líneas sin ramas.

## Con librería de fechas: `@internationalized/date`

Acá sí. `scheduled_at` es `timestamptz` y viaja en UTC, pero la hora que se pinta es la de `users.timezone` (`America/Merida`, default `America/Mexico_City`): si el SO está en otra zona, `new Date(iso).getHours()` muestra un horario que **no** es el que PostFast va a publicar. Y la aritmética que el módulo necesita —"¿a qué día pertenece este instante?", "+30 minutos", "el lunes de esta semana"— es exactamente donde `Date` + `setHours` se equivoca en silencio al cruzar un cambio de horario de verano.

`@internationalized/date` (~8 KB, la misma de react-aria) da `ZonedDateTime` con IANA de verdad y tipos inmutables. El formateo sigue siendo `Intl` nativo encima, en `es-MX`.

Dos cosas hay que decir explícitas y están centralizadas en `lib/calendar/tz.ts`:

- **La semana empieza en lunes.** En CLDR la semana de `es-MX` empieza en domingo, así que `startOfWeek(date, "es-MX")` devuelve el domingo. Se pasa `"mon"` a mano.
- **Los formatters de fecha calendárica van fijados a UTC.** Reciben un `CalendarDate` (un día, sin instante); dejar que `Intl` aplique la zona local correría el día una casilla para cualquiera al oeste de Greenwich.

`components/schedule/date-utils.ts` (F6) sigue usando la zona del navegador. Es un hueco conocido de aquel módulo; el Calendario no lo hereda, y cuando se unifiquen el destino es este módulo.

## Sin librería de drag & drop

Ya estaba decidido: el addendum de ADR-014 dice que una propiedad con dos escritores —un gesto continuo y una animación state-driven— se anima con CSS + variable, nunca con motion, y que el arrastre es escritura directa al DOM sin duración ni curva. `SidebarResizeHandle.tsx` es el precedente. `dnd-kit` daría DnD por teclado, pero esa necesidad ya la cubre el menú ⋮ → "Reprogramar", que la spec exige igual para mobile (donde no hay drag).

## Un endpoint nuevo, no uno extendido

`GET /cards/conflicts` responde "¿choca con algo ya programado?" — solo `scheduled`, sin filtros — y lo consume el ScheduleDrawer para pintar sus markers. El Calendario pregunta otra cosa: "¿qué hay en pantalla?", en todos los estados, con filtros de red / estado / carpeta. Son dos preguntas distintas a la misma tabla; fusionarlas obligaría a que cada llamada declare qué mitad del comportamiento quiere.

`GET /api/cards?from&to` pega contra el índice `cards_calendar (user_id, scheduled_at)`, que existe desde el modelo inicial esperando justo esto. Sin paginación: el rango es un mes por construcción, y el techo duro (`MAX_CALENDAR_RANGE_DAYS = 100`) existe para que un `from` de 1970 no se traduzca en un scan de la tabla entera. El filtro por carpeta hace `INNER JOIN chats` — la carpeta vive en el chat, no en la card, así que una card huérfana (`chat_id` null, el chat se borró) nunca matchea un filtro por carpeta, y eso es correcto: ya no hay de dónde derivarla.

`GET /api/cards/drafts` es aparte porque los borradores **no tienen fecha**: no caen en ningún rango.

## El estado vive en la URL

`/calendario?v=semana&d=2026-08-23`. No en un store: así el back del navegador funciona, la vista se comparte por link, y el deep-link "Ver en calendario" de una card de Chat es simplemente una URL en vez de un canal de mensajes entre módulos. Los valores son las palabras en español que ve el usuario, porque la URL es parte de la interfaz.

Un solo escritor: se guarda el **día enfocado** y el mes se deriva de él. Guardar los dos por separado obliga a sincronizarlos en cada movimiento (flecha derecha el día 31 cambia de mes), que es donde aparecen los estados imposibles.

## La agrupación multi-red se deriva, no se guarda

Un grupo es "estas cards comparten `group_id` **y** el mismo `scheduled_at` exacto". No hay tabla, ni columna, ni flag. Por eso reprogramar una sola red rompe el grupo sin que nadie escriba nada, y devolverla a la hora original lo reconstituye — que es literalmente el comportamiento que pide `presencia-calendario.md` §4. Persistirlo obligaría a mantener sincronizado un espejo de algo que ya se puede leer.

## Cómo quedó el arrastre (F7 PR3)

`lib/calendar/use-drag-schedule.ts`, sin librería y sin motion:

- **Umbral de 6 px** antes de considerar que hay gesto. Es lo que deja convivir "click para ver" y "arrastrar para mover" en el mismo elemento; sin él, el temblor de mano de cualquier click abriría un arrastre.
- **`setPointerCapture` + listeners sobre el elemento agarrado**, no sobre `window` — igual que `SidebarResizeHandle`.
- **La posición del fantasma se escribe directo al DOM** (`ghost.style.transform`), cero renders por frame. Lo único que es estado de React es el día bajo el cursor, que cambia unas pocas veces por segundo y tiene que repintar los resaltados.
- **`elementFromPoint` para resolver el destino**, no `pointerenter` por celda: con el fantasma pegado al cursor, el puntero nunca "entra" a la celda de abajo. El fantasma lleva `pointer-events: none` justamente para que esa consulta lo atraviese.
- **Escape aborta** el gesto en curso.

**Mover conserva la hora de pared, no el instante.** Arrastrar un post de las 18:00 al martes lo deja a las 18:00 del martes, aunque en el medio haya un cambio de horario de verano y eso sean 23 o 25 horas reales. `movedToDay` lo resuelve con `toCalendarDateTime` + `toZoned`, no sumando milisegundos.

**Optimista, con recarga en el fallo.** La grilla se actualiza antes de que conteste el servidor: soltar tiene que sentirse instantáneo o el gesto pierde lo que lo hacía valer. Pero revertir a la copia local **no alcanza**: reprogramar es, del lado del servidor, cancelar el post viejo en el proveedor y crear uno nuevo (ADR-009), así que si lo segundo falla la card **no vuelve sola a donde estaba** — `CardsService` la deja en `draft` (rechazo explícito) o en `failed` (fallo ambiguo). Se revierte para que el hueco no dure el viaje de ida y vuelta, y enseguida se recarga para quedarse con la verdad.

**El click después del gesto.** El navegador dispara un `click` de compatibilidad al terminar cualquier gesto de puntero, y `stopPropagation` en el `pointerdown` no lo evita: son eventos distintos. Sin marcarlo, soltar una publicación abría además su vista. `justDragged()` (ventana de 250 ms) es lo que consulta quien atiende el click.

De paso quedó implementada una regla de la spec que faltaba: **click en un post abre SU vista; click en la celda abre el panel del día** — "intención específica vs intención general" (§3). Cada píldora corta la propagación hacia su celda.

**Soltar un borrador no programa.** Abre el drawer con la fecha puesta: el Calendario decide el DÍA y el Chat decide la hora, cada módulo con su responsabilidad.

## Las vistas Semana y Día (F7 PR4)

`lib/calendar/timeline.ts` es toda la geometría: minutos desde medianoche ↔ píxeles, imantado, carriles. Cuatro decisiones que el diseño no cerraba.

**El eje son 24 horas, no 6:00–23:00.** La spec dibujaba la franja útil, pero recortar significa que una publicación de las 02:00 existe en vista mes y **no existe** en semana — la misma card visible o no según dónde la mires. En vez de recortar, la vista abre desplazada a unas dos horas antes de ahora (`initialScrollTop`), que deja lo inmediato arriba sin esconder lo que acaba de pasar.

**Arrastrar en semana cambia día Y hora; en mes solo el día.** No es una inconsistencia: en mes la celda es un día entero y no dice nada de horarios, así que mover conserva la hora de pared. En semana la posición vertical **es** la hora, y soltar a la altura de las 14:00 tiene que programar a las 14:00 — cualquier otra cosa contradice lo que el usuario está viendo. El imantado es de 15 minutos: alcanzable con el mouse y suficientemente fino para dejar algo a las 14:15.

Eso obligó a que el motor del arrastre reporte **dónde** dentro del destino se soltó, no solo cuál era. `use-drag-schedule` expone `overOffsetY` y el destino se marca con `data-drop-time` cuando ese offset significa algo; la semántica la pone quien llama, el motor sigue sin saber de calendarios.

**Los solapes se reparten en carriles.** Dos publicaciones a las 18:00 y 18:15 ocupan la misma franja; `layoutDay` las parte en media columna cada una, como cualquier calendario. La alternativa —dejarlas superpuestas— hace que la de atrás sea ilegible y casi imposible de agarrar para arrastrarla. Un "racimo" es una cadena de entradas que se pisan entre sí, y todas comparten el mismo número de carriles para no quedar de anchos distintos sin motivo visible; un carril se reusa en cuanto su último bloque terminó. Como los posts no tienen duración, "se pisan" es que disten menos de `BLOCK_MINUTES` (una hora), que es el alto que ocupa un bloque.

**La vista Día no tiene banda lateral.** La spec la llenaba con horarios óptimos del Ritmo (F9). Mismo criterio que con las metas de la barra de cadencia: no se construye una superficie vacía esperando datos que no existen. Lo que la vista gana con todo el ancho son bloques más ricos, que es su razón de ser frente a semana.

## Regiones de scroll: la ruta declara que se hace cargo

Ver el addendum de [ADR-014](./adr-014-estrategia-de-animacion.md). En resumen: la ruta pone `handle: { ownScroll: true }` y `ProtectedLayout` apaga su contenedor genérico. Declarativo en la ruta, no un contexto nuevo: es información estática de la pantalla, y `useMatches()` ya la propaga.

## Responsive: tres bandas, no dos (F7 PR5)

El módulo tiene tres regiones que compiten por ancho (bandeja de borradores, grilla, panel del día) y no aguantan el mismo trato en todos los tamaños:

| Banda    | Borradores          | Celdas del mes     | Panel del día       | Arrastre |
| -------- | ------------------- | ------------------ | ------------------- | -------- |
| ≥1024    | columna de 300px    | píldoras con texto | inspector lateral   | sí       |
| 768–1023 | rail de 56px        | píldoras con texto | inspector lateral   | sí       |
| <768     | hoja inferior modal | puntos por estado  | hoja inferior modal | no       |

El corte de 1024 no es cosmético: con la bandeja abierta a 820px las celdas caen a ~66px de ancho y una píldora deja de leerse; como rail suben a ~101px. El estado se maneja igual que el sidebar del shell (`sidebar-store.ts`): lo que se guarda es **la decisión del usuario** (`userDraftsCollapsed: boolean | null`) y `null` significa "manda el viewport" (`userDraftsCollapsed ?? !isDesktop`). Así un colapso explícito sobrevive un resize y el default sigue siendo el correcto para cada banda.

Abajo de 768 el arrastre no existe (no hay puntero fino) y con él se va la única forma de mandar un borrador a una fecha. La reemplaza un botón **"Programar"** por borrador dentro de la hoja, que abre el `ScheduleDrawer` sin fecha precargada — el mismo drawer del drop, sin el gesto.

Las hojas inferiores del módulo comparten `components/calendar/BottomSheet.tsx` (backdrop + `FloatingFocusManager modal` + `lockScroll` + `sheetUp`). Son **modales**, a diferencia del inspector de escritorio: en un teléfono la hoja ocupa la pantalla, así que fingir que el fondo sigue vivo sería mentir. En la banda de 768–1023 conviven un panel del día NO modal y un `ScheduleDrawer` que ya es hoja modal; por eso el drawer marca su raíz con `data-schedule-drawer` en **las dos** ramas — sin esa marca, el primer click adentro del drawer cerraba el panel que lo abrió.

## Los filtros viven en la URL y se aplican en dos lugares distintos

`?carpeta=&red=&estado=` (`lib/calendar/filters.ts`), y a diferencia del resto del estado de la URL se escriben **sin** `replace`: cada cambio empuja una entrada de historial, que es lo que hace que el back deshaga un filtro en vez de sacarte del módulo. Los tres valores se validan antes de pedir —`carpeta` como uuid— porque un valor inventado se iba derecho al endpoint y volvía un 400 que el usuario veía como un banner de error sin causa visible. Red y estado son listas repetibles, carpeta es una sola. La grilla los aplica en el **servidor** (van como query al endpoint de rango) y la bandeja de borradores en el **cliente**: un borrador no tiene `scheduled_at`, así que nunca entra en una consulta por rango, y son pocos por definición. El filtro de carpeta no se aplica a los borradores —el DTO trae el chat, no la carpeta— y se ignora en vez de vaciar la bandeja en falso.

`canceled` no está entre los estados filtrables: cancelar la programación devuelve la card a `draft`, así que un filtro "Cancelado" no encontraría nunca nada.

Detalle de implementación que cuesta caro olvidar: los memos y efectos que dependen de los filtros se anclan a una **clave string** (`filtersKey`), no al objeto. El objeto es nuevo en cada render y compararlo por referencia recarga en bucle (mismo bug que las `CalendarDate` en el PR1).

## Estados especiales

Cuatro tienen dueño claro y uno se decidió acá:

- **Primera vez** (sin posts y sin borradores), **periodo vacío** y **nada coincide con los filtros** son avisos flotantes que NO bloquean la grilla: el usuario tiene que poder seguir explorando y navegando meses.
- **Sin conexión** y **canal desconectado** van como banda ámbar arriba de la grilla, no como overlay: lo que ya se cargó sigue siendo útil.
- **Canal desconectado** sale de `GET /api/channels/disconnected` y **no** se cruza con las cards del periodo. Cruzarlo fue el primer intento y estaba mal: `cards` viene filtrado del servidor, así que marcar el filtro "Borrador" —o entrar por un link ya filtrado— hacía desaparecer el aviso con el problema intacto. El cruce tampoco agregaba nada: programar exige `social_account_id`, así que una red sin cuenta no puede tener nada programado. El fetch de desconectadas es perezoso en `use-channels.ts`; el Calendario lo pide explícitamente al montar porque es la pantalla donde eso importa.

El esqueleto se muestra **solo en la primera carga** del módulo (`everLoaded`): al cambiar de mes la grilla conserva lo anterior, que se lee mejor que parpadear a vacío y volver. `everLoaded` exige haber visto un ciclo completo (`loading` en true y de vuelta en false): el store arranca en `loading: false`, así que un efecto que solo mire `!loading` lo marca en el primer render y deja el esqueleto muerto.

"Primera vez" es una afirmación sobre la **cuenta**, no sobre el periodo: se decide con los chats (toda publicación nace en Chat, así que cero chats es cero publicaciones posibles) más cero borradores. Con `cards` —que es solo el rango visible— un usuario con meses de historial que avanzaba tres meses veía el onboarding.

## Correcciones del QA manual (F7.1)

**La semana empieza en domingo.** F7 arrancó en lunes tomando la spec al pie de la letra ("7 columnas, Lun a Dom"), pero esa frase describía una grilla, no una convención regional: el CLDR de es-MX empieza en domingo y es lo que espera un usuario mexicano. `WEEK_START` en `tz.ts` es la única fuente; el resto pasa por `weekStart()`. El único sitio que asumía lunes por su cuenta era el resaltado de fin de semana (columnas 5 y 6 → ahora 0 y 6). Queda una inconsistencia anotada: `components/schedule/date-utils.ts` tiene su propio `startOfWeekMonday`, usado por el `WeekStrip` del drawer, que no lee `WEEK_START`.

**El "+N más" se mide, ya no se asume.** `capEntries` usaba un tope fijo de 3 filas. Como la celda es `overflow-hidden`, en una pantalla más baja que ancha (1680×1050) las píldoras que no cabían se recortaban **sin sumarse al contador**: decía la verdad sobre el cap, no sobre lo que se ve. Ahora `MonthGrid` mide el alto real de una fila con un `ResizeObserver` y calcula el cupo; a 1050px de alto entran 4 y a 600px entra 1, y en los dos casos el número coincide con lo que falta.

**El esqueleto reserva el ancho de la bandeja.** Antes pintaba solo la grilla, así que al resolver la carga aparecía de golpe la columna de 300px y el calendario se encogía. Ahora recibe `withDrafts`/`draftsCollapsed` y la grilla arranca y termina en la misma caja.

## Descartado

- **Reutilizar `cards-store.ts`.** Indexa por `chatId` (`byChatId`), que es la pregunta del Chat. La del Calendario cruza chats, incluye cards huérfanas y cambia con los filtros. Compartir store obligaría a inventar una clave que sirva para las dos preguntas.
- **`date-fns` + `date-fns-tz`.** Más conocida, pero su soporte de zona es un add-on que convierte a `Date` local por dentro: más fácil equivocarse justo en el borde de DST, que es el único motivo por el que se trae una librería de fechas.
- **Un breakpoint único de 768.** Dejaba la banda de tablet con la bandeja de 300px comiéndose la grilla, o sin bandeja teniendo ancho de sobra. El rail resuelve las dos.
- **Guardar la preferencia de vista en el perfil.** El usuario que abre un link de semana quiere ver esa semana, no su default. La URL gana.
- **Grilla de 6 filas fijas.** Rellenar siempre a 6 deja una fila entera de días de otro mes en la mitad de los meses y, con filas `1fr`, le roba alto a los días que sí importan. Se renderizan las semanas que el mes realmente ocupa (5 o 6).
