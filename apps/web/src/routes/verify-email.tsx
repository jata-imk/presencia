import { Link } from "react-router";

export function VerifyEmailPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-8">
      <h1 className="text-2xl font-bold">Te mandamos un correo</h1>
      <p>
        Abre el link de confirmación para activar tu cuenta. Al confirmarlo entrarás directo a tus
        chats.
      </p>
      <p className="text-sm">
        ¿Ya confirmaste? <Link to="/login">Inicia sesión</Link>
      </p>
    </main>
  );
}
