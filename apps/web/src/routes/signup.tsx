import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import {
  AUTH_LINK,
  AuthBanner,
  AuthFooter,
  AuthHeading,
  AuthLogo,
  AuthShell,
  AuthSubmit,
} from "../components/auth/AuthShell.js";
import { AuthField } from "../components/auth/AuthField.js";
import { PasswordStrength } from "../components/auth/PasswordStrength.js";
import { authClient } from "../lib/auth-client.js";
import { errorDeCorreo, fuerzaDeContrasena } from "../lib/auth/validar.js";

// FormData.get() devuelve string | File | null — nuestros inputs son de
// texto, nunca File, pero el tipo lo permite; esto lo estrecha sin usar
// String() (que aceptaría un File y lo volvería "[object File]").
function getField(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
}

/**
 * Mínimo "Aceptable" (Auth Flow.html): 8 caracteres y otro criterio más. El
 * servidor solo exige los 8; el resto es para no dejar pasar "contraseña".
 */
function errorDeContrasena(contrasena: string): string | null {
  const { criterios, puntos } = fuerzaDeContrasena(contrasena);
  if (!criterios.largo) return "Usa al menos 8 caracteres.";
  if (puntos < 2) return "Combínala con una mayúscula, un número o un símbolo.";
  return null;
}

/** Qué decirle según lo que respondió Better Auth. */
function mensajeDeError(error: { status?: number; code?: string }): string {
  if (error.status === 429)
    return "Demasiados intentos. Espera unos segundos y vuelve a intentarlo.";
  if (error.code === "INVALID_EMAIL") return "Ese correo no parece válido. Revísalo.";
  if (error.code === "PASSWORD_TOO_LONG")
    return "La contraseña es demasiado larga: usa máximo 128 caracteres.";
  if (error.code === "PASSWORD_TOO_SHORT") return "Usa una contraseña de al menos 8 caracteres.";
  if (error.status !== undefined && error.status < 500) {
    return "No pudimos crear la cuenta con esos datos. Revísalos e inténtalo de nuevo.";
  }
  return "No pudimos crear la cuenta. Inténtalo de nuevo en un momento.";
}

export function SignupPage() {
  const navigate = useNavigate();
  const [errors, setErrors] = useState<{
    name?: string | null;
    email?: string | null;
    password?: string | null;
  }>({});
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Mismo motivo que login.tsx: FormData en vez de inputs controlados,
  // para no depender de que el autofill del navegador/gestor de
  // contraseñas dispare el evento que React necesita para actualizar el
  // state antes del primer submit. `password` sí se sigue en el state, pero
  // solo para pintar el medidor; lo que se manda sale del FormData.
  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    void submit(
      getField(data, "name").trim(),
      getField(data, "email").trim(),
      getField(data, "password"),
    );
  }

  async function submit(name: string, email: string, password: string) {
    const nuevos = {
      name: name ? null : "Cuéntanos cómo te llamas.",
      email: errorDeCorreo(email),
      password: errorDeContrasena(password),
    };
    setErrors(nuevos);
    if (nuevos.name || nuevos.email || nuevos.password) return;
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
    // Un correo que ya tiene cuenta también llega aquí sin error (F10.8.4):
    // Better Auth responde igual para no revelar qué correos están
    // registrados, y al dueño le manda un aviso (onExistingUserSignUp en
    // apps/api/src/auth/auth.ts). Por eso tampoco hay chequeo en vivo.
    if (error) {
      setError(mensajeDeError(error));
      return;
    }
    void navigate("/verify-email", { state: { email } });
  }

  return (
    <AuthShell>
      <AuthLogo />
      <AuthHeading title="Crea tu cuenta" subtitle="Empieza a construir tu presencia hoy." />
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        {error && (
          <AuthBanner tone="error" onClose={() => setError(null)}>
            {error}
          </AuthBanner>
        )}
        <AuthField
          label="Nombre"
          name="name"
          autoComplete="name"
          placeholder="Tu nombre o el de tu marca"
          error={errors.name}
          onChange={() => errors.name && setErrors((prev) => ({ ...prev, name: null }))}
        />
        <AuthField
          label="Correo"
          type="email"
          name="email"
          autoComplete="email"
          placeholder="tu@correo.com"
          error={errors.email}
          onChange={() => errors.email && setErrors((prev) => ({ ...prev, email: null }))}
          onBlur={(e) => {
            // El valor se lee aquí: el updater corre después y para entonces
            // React ya soltó currentTarget.
            const correo = e.currentTarget.value;
            if (correo) setErrors((prev) => ({ ...prev, email: errorDeCorreo(correo) }));
          }}
        />
        <div className="flex flex-col gap-2">
          <AuthField
            label="Contraseña"
            type="password"
            name="password"
            autoComplete="new-password"
            placeholder="Mínimo 8 caracteres"
            error={errors.password}
            onChange={(e) => {
              setPassword(e.currentTarget.value);
              if (errors.password) setErrors((prev) => ({ ...prev, password: null }));
            }}
          />
          <PasswordStrength password={password} />
        </div>
        <AuthSubmit loading={submitting}>
          {submitting ? "Creando tu cuenta…" : "Crear cuenta"}
        </AuthSubmit>
      </form>
      <AuthFooter>
        ¿Ya tienes cuenta?{" "}
        <Link to="/login" className={AUTH_LINK}>
          Inicia sesión
        </Link>
      </AuthFooter>
    </AuthShell>
  );
}
