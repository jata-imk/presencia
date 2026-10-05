// La forma de una conversación mientras llegan sus mensajes (F10.6.2):
// antes, "Cargando…" en texto. Una burbuja del usuario a la derecha y unas
// líneas de respuesta, con el mismo ancho de lectura que el chat de verdad,
// para que al llegar el contenido no salte.
export function ChatSkeleton() {
  return (
    <main aria-busy="true" aria-label="Cargando la conversación" className="h-full overflow-hidden">
      <div className="mx-auto flex max-w-[732px] flex-col gap-5 px-4 py-6">
        <div className="skeleton ml-auto h-11 w-2/3 max-w-80 rounded-2xl" />
        <div className="flex flex-col gap-2.5">
          <div className="skeleton h-3.5 w-11/12 rounded-md" />
          <div className="skeleton h-3.5 w-full rounded-md" />
          <div className="skeleton h-3.5 w-4/5 rounded-md" />
          <div className="skeleton h-3.5 w-3/5 rounded-md" />
        </div>
        <div className="skeleton ml-auto h-11 w-1/2 max-w-64 rounded-2xl" />
        <div className="flex flex-col gap-2.5">
          <div className="skeleton h-3.5 w-full rounded-md" />
          <div className="skeleton h-3.5 w-2/3 rounded-md" />
        </div>
      </div>
    </main>
  );
}
