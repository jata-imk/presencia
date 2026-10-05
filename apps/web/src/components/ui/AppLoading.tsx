// Lo que se ve mientras se resuelve la sesión al abrir o recargar cualquier
// pantalla (F10.6.2): el fondo de la app y nada más. Antes era "Cargando…"
// en texto arriba a la izquierda; se probó el isotipo con un pulso y Jose
// prefirió nada: casi siempre la sesión llega en un instante.
export function AppLoading() {
  return <main aria-busy="true" aria-label="Cargando Presencia" className="h-dvh bg-app" />;
}
