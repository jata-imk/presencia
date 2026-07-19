import { socialNetworkSchema } from "@presencia/shared";

// Smoke test visual de los design tokens (F0). El App Shell real
// llega con el import de pantallas post-F1.
export function App() {
  return (
    <main className="mx-auto flex min-h-screen max-w-(--content-max-w) flex-col items-start justify-center gap-4 p-8">
      <h1 className="text-3xl font-bold tracking-tight text-brand">Presencia</h1>
      <p className="text-md text-fg-secondary">
        Esqueleto F0 con design tokens. Redes soportadas: {socialNetworkSchema.options.join(", ")}.
      </p>
      <button
        type="button"
        className="rounded-lg bg-primary px-4 py-2 font-display text-sm font-semibold text-primary-fg shadow-sm transition-colors duration-(--duration-fast) hover:bg-primary-hover"
      >
        + Nuevo chat
      </button>
      <button
        type="button"
        onClick={() => {
          const root = document.documentElement;
          if (root.dataset.theme === "dark") {
            delete root.dataset.theme;
          } else {
            root.dataset.theme = "dark";
          }
        }}
        className="rounded-md border border-line bg-card px-3 py-1.5 text-sm text-fg-secondary hover:bg-secondary-hover"
      >
        Alternar modo oscuro
      </button>
    </main>
  );
}
