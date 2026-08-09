import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { authClient } from "../lib/auth-client.js";

// FormData.get() devuelve string | File | null — nuestros inputs son de
// texto, nunca File, pero el tipo lo permite; esto lo estrecha sin usar
// String() (que aceptaría un File y lo volvería "[object File]").
function getField(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
}

export function SignupPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Mismo motivo que login.tsx: FormData en vez de inputs controlados,
  // para no depender de que el autofill del navegador/gestor de
  // contraseñas dispare el evento que React necesita para actualizar el
  // state antes del primer submit.
  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    void submit(getField(data, "name"), getField(data, "email"), getField(data, "password"));
  }

  async function submit(name: string, email: string, password: string) {
    setError(null);
    setSubmitting(true);
    const { error } = await authClient.signUp.email({
      name,
      email,
      password,
      // A dónde aterriza el link de verificación una vez confirmado.
      // Absoluto: el link del correo vive en el origen de la API, así
      // que un path relativo redirigiría al 3000 (404) y no a la web.
      callbackURL: `${window.location.origin}/chats`,
    });
    setSubmitting(false);
    if (error) {
      setError(error.message ?? "No se pudo crear la cuenta. Inténtalo de nuevo.");
      return;
    }
    void navigate("/verify-email");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-8">
      <h1 className="text-2xl font-bold">Crea tu cuenta</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input className="border p-2" name="name" placeholder="Tu nombre" required />
        <input className="border p-2" type="email" name="email" placeholder="Correo" required />
        <input
          className="border p-2"
          type="password"
          name="password"
          placeholder="Contraseña (mínimo 8 caracteres)"
          minLength={8}
          required
        />
        {error && <p className="text-sm text-error">{error}</p>}
        <button type="submit" className="border p-2 font-semibold" disabled={submitting}>
          {submitting ? "Creando cuenta…" : "Registrarme"}
        </button>
      </form>
      <p className="text-sm">
        ¿Ya tienes cuenta? <Link to="/login">Inicia sesión</Link>
      </p>
    </main>
  );
}
