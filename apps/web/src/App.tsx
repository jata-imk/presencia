import { MotionConfig } from "motion/react";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router";
import { ArchivedChatsPage } from "./routes/archived-chats.js";
import { ChatPage } from "./routes/chat.js";
import { ChatsPage } from "./routes/chats.js";
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
          { path: "/configuracion/plan", element: <PlanPage /> },
          { path: "/configuracion/canales", element: <CanalesPage /> },
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
  return (
    <MotionConfig reducedMotion="user">
      <RouterProvider router={router} />
    </MotionConfig>
  );
}
