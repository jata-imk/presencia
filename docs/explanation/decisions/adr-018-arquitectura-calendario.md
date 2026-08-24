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

## Regiones de scroll: la ruta declara que se hace cargo

Ver el addendum de [ADR-014](./adr-014-estrategia-de-animacion.md). En resumen: la ruta pone `handle: { ownScroll: true }` y `ProtectedLayout` apaga su contenedor genérico. Declarativo en la ruta, no un contexto nuevo: es información estática de la pantalla, y `useMatches()` ya la propaga.

## Descartado

- **Reutilizar `cards-store.ts`.** Indexa por `chatId` (`byChatId`), que es la pregunta del Chat. La del Calendario cruza chats, incluye cards huérfanas y cambia con los filtros. Compartir store obligaría a inventar una clave que sirva para las dos preguntas.
- **`date-fns` + `date-fns-tz`.** Más conocida, pero su soporte de zona es un add-on que convierte a `Date` local por dentro: más fácil equivocarse justo en el borde de DST, que es el único motivo por el que se trae una librería de fechas.
- **Guardar la preferencia de vista en el perfil.** El usuario que abre un link de semana quiere ver esa semana, no su default. La URL gana.
- **Grilla de 6 filas fijas.** Rellenar siempre a 6 deja una fila entera de días de otro mes en la mitad de los meses y, con filas `1fr`, le roba alto a los días que sí importan. Se renderizan las semanas que el mes realmente ocupa (5 o 6).
