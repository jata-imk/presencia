## Addendum (2026-08-26, F7 PR5) — items de casilla

`Menu.Item` acepta `checked`, y con eso se renderiza como `menuitemcheckbox` (con `aria-checked`) y **no cierra el menú** al activarse. `keepOpen` permite lo segundo sin lo primero.

Salió del popover de filtros del Calendario: marcar una red no es "elegir y salir", el menú tiene que seguir abierto para marcar la siguiente y ver la grilla cambiar detrás. La primera versión usaba `<button role="menuitemcheckbox">` sueltos dentro de `Menu.Content` y eso parecía equivalente — no lo era: los items se registran en el `listRef` de `use-menu`, que es de donde `useListNavigation` saca las flechas. Con botones propios el contenedor anunciaba `role="menu"` sobre una lista vacía: ↑/↓ no hacían nada y las opciones solo se alcanzaban con el mouse.

Regla que deja: **todo lo enfocable dentro de `Menu.Content` es `Menu.Item`**. Si necesita otro comportamiento, se le agrega una prop al primitivo; no se escribe un botón al lado.
