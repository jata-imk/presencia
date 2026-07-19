import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { authClient } from "../lib/auth-client.js";

export function SignupPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
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
    const { error } = await authClient.signUp.email({
      name,
      email,
      password,
      // A dónde aterriza el link de verificación una vez confirmado.
      callbackURL: "/chats",
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
        <input
          className="border p-2"
          placeholder="Tu nombre"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
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
          placeholder="Contraseña (mínimo 8 caracteres)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
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
