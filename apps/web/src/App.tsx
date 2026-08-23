import { MotionConfig } from "motion/react";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router";
import { useThemeSync } from "./lib/use-theme.js";
import { ArchivedChatsPage } from "./routes/archived-chats.js";
import { CalendarioPage } from "./routes/calendario.js";
import { ChatPage } from "./routes/chat.js";
import { ChatsPage } from "./routes/chats.js";
import { AparienciaPage } from "./routes/configuracion/apariencia.js";
import { CanalesDesconectadasPage } from "./routes/configuracion/canales-desconectadas.js";
import { CanalesPage } from "./routes/configuracion/canales.js";
import { ConfiguracionLayout } from "./routes/configuracion/layout.js";
import { MiPerfilPage } from "./routes/configuracion/mi-perfil.js";
import { PlanPage } from "./routes/configuracion/plan.js";
import { VozDeMarcaPage } from "./routes/configuracion/voz-de-marca.js";
import { LoginPage } from "./routes/login.js";
import { OnboardingPage } from "./routes/onboarding.js";
import { ProtectedLayout } from "./routes/protected.js";
import { SignupPage } from "./routes/signup.js";
import { VerifyEmailPage } from "./routes/verify-email.js";

// Rutas F1 sin diseño: el App Shell real llega con el import de
// pantallas de Claude Design post-F1.
const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  { path: "/signup", element: <SignupPage /> },
  { path: "/verify-email", element: <VerifyEmailPage /> },
  {
    element: <ProtectedLayout />,
    children: [
      { path: "/", element: <Navigate to="/chats" replace /> },
      { path: "/chats", element: <ChatsPage /> },
      { path: "/chats/archivados", element: <ArchivedChatsPage /> },
      { path: "/chats/:id", element: <ChatPage /> },
      // handle.ownScroll: el Calendario se hace cargo de su propio alto y de
      // sus regiones de scroll, así que ProtectedLayout apaga el contenedor
      // genérico `overflow-y-auto`. Declarativo en la ruta y no en un
      // contexto nuevo: es información estática de la pantalla, y react-router
      // ya la propaga con useMatches(). Ver ADR-018.
      { path: "/calendario", element: <CalendarioPage />, handle: { ownScroll: true } },
      { path: "/onboarding", element: <OnboardingPage /> },
      {
        path: "/configuracion",
        element: <ConfiguracionLayout />,
        children: [
          // Voz de marca es la sub-sección más importante (overview §3) —
          // default al entrar a /configuracion sin sub-ruta.
          {
            path: "/configuracion",
            element: <Navigate to="/configuracion/voz-de-marca" replace />,
          },
          { path: "/configuracion/voz-de-marca", element: <VozDeMarcaPage /> },
          { path: "/configuracion/mi-perfil", element: <MiPerfilPage /> },
          { path: "/configuracion/apariencia", element: <AparienciaPage /> },
          { path: "/configuracion/plan", element: <PlanPage /> },
          { path: "/configuracion/canales", element: <CanalesPage /> },
          {
            path: "/configuracion/canales/desconectadas",
            element: <CanalesDesconectadasPage />,
          },
        ],
      },
    ],
  },
]);

// ScheduleDrawer/ToastViewport (F6 PR4) se montan dentro de ProtectedLayout,
// no acá — necesitan el contexto de <RouterProvider> (usan <Link>), que no
// llega a hermanos renderizados fuera de él.
//
// MotionConfig con reducedMotion="user" (ADR-014): respeta
// prefers-reduced-motion del SO en todo motion.* de la app de un solo
// lugar — ningún componente individual tiene que acordarse de chequearlo.
export function App() {
  // Proyecta la preferencia de tema al <html> (ADR-016). Una sola llamada
  // en toda la app: el script inline de index.html ya lo pintó antes del
  // primer paint, esto se hace cargo de los cambios en vivo.
  useThemeSync();

  return (
    <MotionConfig reducedMotion="user">
      <RouterProvider router={router} />
    </MotionConfig>
  );
}
