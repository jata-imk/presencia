import { Navigate, Outlet, useLocation, useMatches } from "react-router";
import { Sidebar } from "../components/layout/Sidebar.js";
import { Topbar } from "../components/layout/Topbar.js";
import { CommandPalette } from "../components/search/CommandPalette.js";
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
//
// Onboarding no lleva el shell (Sidebar/Topbar/Drawer): todavía no hay
// "Chats" que navegar ni nada que programar — es una pantalla propia.
//
// App Shell (F6 PR5, Chat Conversation.html): una sola zona de scroll de
// contenido por pantalla — h-dvh overflow-hidden acá arriba fija
// Sidebar/Topbar, y un solo contenedor overflow-y-auto envuelve el
// <Outlet/> (así las páginas viejas no necesitan saber nada de esto).
// ScheduleDrawer es hermano flex del contenido, no un overlay fixed: empuja
// en vez de taparlo — eso es lo que de raíz evita el doble scroll
// encimado que reportó Jose. Ver ADR-014.
/** Rutas que declaran `handle: { ownScroll: true }` (ver App.tsx y ADR-018). */
interface RouteHandle {
  ownScroll?: boolean;
}

export function ProtectedLayout() {
  const { data: session, isPending } = authClient.useSession();
  const location = useLocation();
  const ownScroll = useMatches().some(
    (match) => (match.handle as RouteHandle | undefined)?.ownScroll,
  );

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

  if (onOnboardingRoute) {
    return <Outlet />;
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-app">
      <Sidebar />
      <div className="flex min-w-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <Topbar />
          {/* Zona de scroll por defecto — las páginas viejas (Configuración,
              la lista de chats pre-PR6) no necesitan saber nada de esto,
              heredan el scroll de acá sin tocar su propio markup.
              Las pantallas que manejan su propio alto lo dicen con
              `handle: { ownScroll: true }` en su ruta y acá se apaga: si no,
              quedarían dos ejes verticales en la misma región, que es
              exactamente el bug que corrigió ADR-014. El Calendario (F7) es
              el primer caso; chat.tsx sigue funcionando adentro porque su
              raíz es h-full y nunca desborda. */}
          <div className={`min-h-0 flex-1 ${ownScroll ? "overflow-hidden" : "overflow-y-auto"}`}>
            <Outlet />
          </div>
        </div>
        <ScheduleDrawer />
      </div>
      <CommandPalette />
      <ToastViewport />
    </div>
  );
}
