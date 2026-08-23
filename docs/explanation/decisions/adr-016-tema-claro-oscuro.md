# ADR-016 · Tema: preferencia en localStorage + `data-theme` en `<html>`

**Decisión:** la preferencia de tema (`"light" | "dark" | "system"`, default `"system"`) vive en `localStorage` bajo `presencia.theme`. Un script clásico inline en `<head>` la lee y escribe `data-theme` + `color-scheme` en `<html>` **antes del primer paint**; React la sincroniza después vía `useThemeSync()` en `App.tsx`.

**Razón:** los tokens de dark (`[data-theme="dark"]` en `tokens.css`) y la variante `dark:` de Tailwind existían desde F1 y nunca se ejecutaron — faltaba únicamente quién escribiera el atributo. La decisión real no era _cómo pintar_ el tema oscuro, sino **dónde vive la preferencia y cuándo se aplica**.

## Una sola fuente de verdad: la preferencia

El estado persistido es la **preferencia**; el tema resuelto es una **función pura** de esa preferencia más `prefers-color-scheme`; el atributo del DOM es una **proyección**. Nadie guarda "resolved" en ningún lado.

```
preference ──┐
             ├─► resolve() ─► data-theme + color-scheme en <html>
systemDark ──┘
```

Consecuencia útil: reaccionar a que el usuario cambie el tema del SO **sale gratis**. `useMediaQuery` (`lib/use-media-query.ts`) ya escucha el evento `change` del `MediaQueryList`, así que con `preference === "system"` el valor resuelto cambia solo. Y si la preferencia es explícita, `resolved` no depende de `systemDark` y el cambio del SO se ignora sin necesidad de un `if` que lo diga.

`"system"` cumple exactamente el mismo rol que `userCollapsed: null` en `sidebar-store.ts`: **se persiste la decisión del usuario, nunca el estado efectivo**. Los dos stores se referencian entre sí en sus comentarios.

## Por qué el script inline es clásico y no un módulo

Un `<script type="module">` es diferido por especificación: corre después del primer paint, o sea que el flash blanco ocurre igual. Tiene que ser un script clásico, inline, antes del CSS.

`color-scheme` importa tanto como `data-theme`: sin él, el _canvas_ del navegador (lo que se ve antes de que el CSS pinte) y los controles nativos —scrollbars del SO, inputs de fecha, autofill— siguen en claro, y el flash existe aunque el atributo esté puesto.

**La duplicación script↔TS es deliberada.** El script no puede importar el store porque corre antes del bundle, así que espeja la regla mínima (clave de storage, valores válidos, fallback). Es el mismo trato que `lib/motion.ts` con `tokens.css` (ADR-014: _"el espejo es manual — pero es un solo archivo"_), y hay comentarios cruzados en ambos lados.

## Tres puntos de entrada, un solo control real

| Dónde                          | Qué hace                                                                                                          |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| **Configuración > Apariencia** | Canónico (overview §3, grupo CUENTA). Radiogroup de 3; con "Sistema" activo dice qué está resolviendo ahora mismo |
| **Topbar**                     | Atajo de 2 estados. El ícono muestra el estado _actual_ (sol/luna), el `aria-label` dice la _acción_              |
| **Menú de cuenta**             | Un link a Apariencia, **no un tercer toggle**                                                                     |

El overview (§5) pedía un "Modo oscuro toggle" también en el menú de cuenta. Se reconcilió a un link: tres formas de voltear el mismo bit es ruido, y Apariencia es la única superficie que ofrece las tres opciones.

## Lo que la auditoría encontró

`[data-theme="dark"]` estaba escrito pero **jamás había corrido**. Los bugs reales que aparecieron al ejecutarlo por primera vez, todos corregidos en el mismo PR:

- **Logos monocromos invisibles.** X, TikTok y Threads usaban `#000` literal — negro sobre `#1a0f20`. Token nuevo `--brand-monochrome` (negro en claro, plum-100 en oscuro). No es retokenizar el color de un tercero: la propia guía de marca de esas tres redes pide el logo invertido sobre fondos oscuros, así que es la versión _correcta_ del mismo logo.
- **Fondos de estado casi blancos.** `--status-*-bg` eran tintes claros (`#f0fdf4` y compañía) pensados para fondo claro; sobre una card oscura eran bloques luminosos. Se rebajaron a tintes oscuros del mismo matiz. El texto de estado no cambia: ya tenía contraste de sobra.
- **Scrollbar clara.** Estaba clavada a `--color-neutral-300` (paleta cruda). Token `--scrollbar-thumb` que voltea.
- **Sombras invisibles.** Las `--shadow-*` son rgba plum calibradas para fondo claro. En dark se refuerzan con negro real, para que menús, modales y toasts sigan despegándose del fondo.
- (`text-white` sobre `bg-brand` en el sidebar y `brightness-0 invert` en el isotipo se habían corregido antes, en el PR del App Shell.)

## Descartado

- **`prefers-color-scheme` puro, sin override.** Cero código, pero no deja elegir: un usuario con el SO en claro no puede tener Presencia en oscuro.
- **La preferencia en el perfil, en DB.** Sincronizaría entre dispositivos, pero el tema no se puede pintar hasta que resuelva la sesión — o sea **FOUC estructural**, o una pantalla de carga, o un fallback a localStorage que reintroduce todo esto igual. Cuesta una migración y un campo en Better Auth para empeorar el primer paint.
- **`class="dark"` de Tailwind.** `data-theme` ya estaba en `tokens.css:194` y en el `@custom-variant` de `app.css:7` desde F1; cambiarlo sería reescribir el contrato de tokens sin ganar nada.

**Ver también:** [`docs/reference/design-tokens.md`](../../reference/design-tokens.md) §Dark mode — el mapeo canónico de tokens light/dark.
