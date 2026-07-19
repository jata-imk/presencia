import { Navigate, Outlet } from "react-router";
import { authClient } from "../lib/auth-client.js";

// Layout de rutas autenticadas: sin sesión → /login.
export function ProtectedLayout() {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return <main className="p-8">Cargando…</main>;
  }
  if (!session) {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}
