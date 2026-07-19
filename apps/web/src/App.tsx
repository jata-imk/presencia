import { createBrowserRouter, Navigate, RouterProvider } from "react-router";
import { ChatPage } from "./routes/chat.js";
import { ChatsPage } from "./routes/chats.js";
import { LoginPage } from "./routes/login.js";
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
      { path: "/chats/:id", element: <ChatPage /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
