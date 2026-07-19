import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { authClient } from "../lib/auth-client.js";

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void submit();
  }

  async function submit() {
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
        <input
          className="border p-2"
          type="email"
          placeholder="Correo"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className="border p-2"
          type="password"
          placeholder="Contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
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
