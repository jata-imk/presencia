## Addendum (2026-08-26, F7 PR5) — items de casilla

`Menu.Item` acepta `checked`, y con eso se renderiza como `menuitemcheckbox` (con `aria-checked`) y **no cierra el menú** al activarse. `keepOpen` permite lo segundo sin lo primero.

Salió del popover de filtros del Calendario: marcar una red no es "elegir y salir", el menú tiene que seguir abierto para marcar la siguiente y ver la grilla cambiar detrás. La primera versión usaba `<button role="menuitemcheckbox">` sueltos dentro de `Menu.Content` y eso parecía equivalente — no lo era: los items se registran en el `listRef` de `use-menu`, que es de donde `useListNavigation` saca las flechas. Con botones propios el contenedor anunciaba `role="menu"` sobre una lista vacía: ↑/↓ no hacían nada y las opciones solo se alcanzaban con el mouse.

Regla que deja: **todo lo enfocable dentro de `Menu.Content` es `Menu.Item`**. Si necesita otro comportamiento, se le agrega una prop al primitivo; no se escribe un botón al lado.

## Addendum (2026-09-03, F7.1) — la cuarta primitiva: `Tooltip`

`lib/floating/use-tooltip.ts` + `components/ui/Tooltip.tsx`. Se justifica con el mismo criterio que el inspector: no encaja en ninguna de las que hay. No es `Menu` (no se abre con click ni tiene items navegables), no es `Dialog` (no bloquea nada) y no es `Inspector` (no vive abierto ni lo cierra el usuario) — se abre solo al apuntar o al enfocar, y se va igual de solo.

Reemplaza al atributo `title` nativo en 28 sitios. El nativo no se puede estilar, tarda cerca de un segundo, no responde al foco de teclado en varios navegadores y se esconde a los pocos segundos aunque el puntero siga encima.

Tres decisiones que quedan fijas:

- **API de envoltura, no compuesta.** Los 28 casos son "un elemento, un texto", así que `<Tooltip label="…"><button/></Tooltip>` clonando el hijo. `Trigger`/`Content` sería ceremonia sin ganancia; `Menu` es compuesto porque sus menús mezclan botones con contenido condicional, que no es el caso acá.
- **Sin flecha.** No se usa el middleware `arrow` de floating-ui: un globito pegado al elemento ya dice de quién habla, y la flecha obliga a un nodo extra que hay que reposicionar en cada `flip`.
- **Un botón deshabilitado no emite eventos de puntero**, y justo los tooltips que más falta hacen cuelgan de botones apagados ("Próximamente", "Ver en la red"). Cuando el hijo trae `disabled`, el ancla pasa a ser un `<span tabIndex={0}>` que sí los recibe — y de paso el globito también sale con teclado.

**Trampa que costó un PR:** floating-ui posiciona por defecto con `transform: translate(x, y)`, y el globito entra con una animación de motion, que escribe **su propio** `transform` sobre el mismo nodo. El de motion gana y el tooltip aparece pegado en la esquina superior izquierda (0,0). Por eso `use-tooltip` pide `transform: false`, que posiciona con `top`/`left` reales y le deja el `transform` libre a motion. `Menu` no lo necesita porque no anima nada.

Se cuela en silencio: el globito tiene el texto correcto, el tema correcto y el z-index correcto — lo único que está mal es dónde aparece. **Verificar un flotante es medir su caja contra la de su ancla**, no leer su contenido.

Dos límites, a propósito:

- **Un tooltip nunca es la única fuente de una etiqueta.** En táctil no hay hover y el globito no existe: donde el `title` era lo único que nombraba un control (los iconos del sidebar colapsado), el `aria-label` se queda puesto.
- **`Menu.Item` conserva el `title` nativo.** El item ya usa su ref para registrarse en el `listRef` de `use-menu` —de ahí salen las flechas— y envolverlo le robaría ese anclaje. Además un globito dentro de un menú ya abierto y flotando sobre el contenido no aporta nada.
