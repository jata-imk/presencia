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

export function LoginPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // FormData en vez de inputs controlados para email/password: los
  // gestores de contraseñas (1Password, Bitwarden, el de Chrome) rellenan
  // el DOM directo y no siempre disparan el evento que React necesita
  // para actualizar el state — el primer submit puede mandar credenciales
  // vacías/viejas (401) aunque se vean llenas en pantalla, y el segundo
  // intento ya funciona porque para entonces state y DOM convergieron.
  // Leer del FormData en el submit toma lo que el navegador tiene puesto
  // de verdad, sin depender de qué evento haya disparado el autofill.
  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    void submit(getField(data, "email"), getField(data, "password"));
  }

  async function submit(email: string, password: string) {
    setError(null);
    setSubmitting(true);
    const { error } = await authClient.signIn.email({ email, password });
    setSubmitting(false);
    if (error) {
      setError(
        error.status === 403
          ? "Confirma tu correo antes de entrar. Revisa tu bandeja."
          : (error.message ?? "No se pudo iniciar sesión. Revisa tus datos."),
      );
      return;
    }
    void navigate("/chats");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-8">
      <h1 className="text-2xl font-bold">Inicia sesión</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input className="border p-2" type="email" name="email" placeholder="Correo" required />
        <input
          className="border p-2"
          type="password"
          name="password"
          placeholder="Contraseña"
          required
        />
        {error && <p className="text-sm text-error">{error}</p>}
        <button type="submit" className="border p-2 font-semibold" disabled={submitting}>
          {submitting ? "Entrando…" : "Entrar"}
        </button>
      </form>
      <p className="text-sm">
        ¿No tienes cuenta? <Link to="/signup">Regístrate</Link>
      </p>
    </main>
  );
}
