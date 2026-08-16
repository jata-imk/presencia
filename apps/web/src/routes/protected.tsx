import { Navigate, Outlet, useLocation } from "react-router";
import { ScheduleDrawer } from "../components/schedule/ScheduleDrawer.js";
import { ToastViewport } from "../components/ui/Toast.js";
import { authClient } from "../lib/auth-client.js";

// Layout de rutas autenticadas: sin sesión → /login. Con sesión pero sin
// onboarding completo → /onboarding (excepto en la propia ruta, para no
// hacer loop). onboardingCompletedAt llega tipado como Date | null gracias
// al plugin inferAdditionalFields de auth-client.ts.
//
// ScheduleDrawer/ToastViewport (F6 PR4) se montan acá, no en App.tsx: usan
// <Link> de react-router, que necesita el contexto del Router — App.tsx los
// renderizaba como hermanos de <RouterProvider>, fuera de ese contexto
// ("Cannot destructure property 'basename'... as it is null"), crash real
// detectado por Jose al abrir el drawer. Acá adentro, dentro del árbol que
// <RouterProvider> sí controla, funciona. Además solo tiene sentido en
// rutas autenticadas (login/signup no programan nada).
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

  return (
    <>
      <Outlet />
      <ScheduleDrawer />
      <ToastViewport />
    </>
  );
}
