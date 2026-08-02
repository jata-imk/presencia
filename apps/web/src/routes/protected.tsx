import { Navigate, Outlet, useLocation } from "react-router";
import { authClient } from "../lib/auth-client.js";

// Layout de rutas autenticadas: sin sesión → /login. Con sesión pero sin
// onboarding completo → /onboarding (excepto en la propia ruta, para no
// hacer loop). onboardingCompletedAt llega tipado como Date | null gracias
// al plugin inferAdditionalFields de auth-client.ts.
export function ProtectedLayout() {
  const { data: session, isPending } = authClient.useSession();
  const location = useLocation();

  if (isPending) {
    return <main className="p-8">Cargando…</main>;
  }
  if (!session) {
    return <Navigate to="/login" replace />;
  }

  const needsOnboarding = session.user.onboardingCompletedAt === null;
  const onOnboardingRoute = location.pathname === "/onboarding";
  if (needsOnboarding && !onOnboardingRoute) {
    return <Navigate to="/onboarding" replace />;
  }
  if (!needsOnboarding && onOnboardingRoute) {
    return <Navigate to="/chats" replace />;
  }

  return <Outlet />;
}
