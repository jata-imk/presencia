import { socialNetworkSchema } from "@presencia/shared";

// Placeholder de F0: prueba que el workspace linkea shared → web.
// El App Shell real llega con el import de Claude Design (post-F1).
export function App() {
  return (
    <main>
      <h1>Presencia</h1>
      <p>Esqueleto F0. Redes soportadas: {socialNetworkSchema.options.join(", ")}.</p>
    </main>
  );
}
