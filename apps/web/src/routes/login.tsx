import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router";
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
import { authClient } from "../lib/auth-client.js";
import { olvidarSesion, rutaDeRegreso } from "../lib/auth/sesion.js";
import { errorDeCorreo } from "../lib/auth/validar.js";

// FormData.get() devuelve string | File | null — nuestros inputs son de
// texto, nunca File, pero el tipo lo permite; esto lo estrecha sin usar
// String() (que aceptaría un File y lo volvería "[object File]").
function getField(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
}

/** Lo que ProtectedLayout (o el registro) deja en el state al mandar aquí. */
interface LoginState {
  from?: string;
  expired?: boolean;
  email?: string;
}

/**
 * Cuenta regresiva del límite de intentos (F10.8.4): Better Auth deja 3
 * intentos de entrar cada 10 s por IP y responde 429 con X-Retry-After.
 * Mientras corre, el formulario se deshabilita.
 */
function useEspera(): [number, (segundos: number) => void] {
  const [hasta, setHasta] = useState<number | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    if (hasta === null) return;
    const id = setInterval(() => {
      const t = Date.now();
      setAhora(t);
      if (t >= hasta) setHasta(null);
    }, 250);
    return () => clearInterval(id);
  }, [hasta]);
  const restantes = hasta === null ? 0 : Math.max(0, Math.ceil((hasta - ahora) / 1000));
  return [
    restantes,
    (segundos) => {
      setAhora(Date.now());
      setHasta(Date.now() + segundos * 1000);
    },
  ];
}

export function LoginPage() {
  const navigate = useNavigate();
  const state = (useLocation().state ?? {}) as LoginState;
  const [errors, setErrors] = useState<{ email?: string | null; password?: string | null }>({});
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(state.expired === true);
  const [submitting, setSubmitting] = useState(false);
  const [espera, esperar] = useEspera();
  const { refetch: refrescarSesion } = authClient.useSession();

  // El aviso se muestra una vez: si recarga o vuelve a /login, ya no.
  useEffect(() => {
    olvidarSesion();
  }, []);

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
    void submit(getField(data, "email").trim(), getField(data, "password"));
  }

  async function submit(email: string, password: string) {
    const nuevos = {
      email: errorDeCorreo(email),
      password: password ? null : "Escribe tu contraseña.",
    };
    setErrors(nuevos);
    if (nuevos.email || nuevos.password) return;
    setError(null);
    setSubmitting(true);
    let reintentarEn: number | null = null;
    const { error } = await authClient.signIn.email(
      { email, password },
      {
        onError: ({ response }) => {
          if (response.status === 429) {
            reintentarEn = Number(response.headers.get("X-Retry-After")) || 10;
          }
        },
      },
    );
    setSubmitting(false);
    if (reintentarEn !== null) {
      esperar(reintentarEn);
      return;
    }
    if (error) {
      setError(
        error.status === 403
          ? "Confirma tu correo antes de entrar. Revisa tu bandeja."
          : error.status === 401
            ? "El correo o la contraseña no coinciden. Revisa que sea la cuenta correcta."
            : "No pudimos conectar. Inténtalo de nuevo en un momento.",
      );
      return;
    }
    // La sesión nueva antes de navegar: Better Auth la vuelve a pedir en otro
    // tick, y ProtectedLayout la vería todavía vacía y regresaría al login.
    await refrescarSesion();
    void navigate(rutaDeRegreso(state.from), { replace: true });
  }

  const bloqueado = espera > 0;

  return (
    <AuthShell>
      <AuthLogo />
      {expired && (
        <AuthBanner tone="info" title="Tu sesión se cerró" onClose={() => setExpired(false)}>
          Inicia sesión de nuevo para seguir donde te quedaste.
        </AuthBanner>
      )}
      <AuthHeading
        title="Hola de nuevo"
        subtitle={
          expired ? "Entra otra vez para retomar tu trabajo." : "Entra para seguir creando."
        }
      />
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        {bloqueado ? (
          <AuthBanner tone="warning" title="Demasiados intentos">
            Por seguridad, espera{" "}
            <strong className="tabular-nums">
              {espera} {espera === 1 ? "segundo" : "segundos"}
            </strong>{" "}
            antes de volver a intentarlo.
          </AuthBanner>
        ) : (
          error && (
            <AuthBanner tone="error" onClose={() => setError(null)}>
              {error}
            </AuthBanner>
          )
        )}
        <AuthField
          label="Correo"
          type="email"
          name="email"
          autoComplete="email"
          placeholder="tu@correo.com"
          defaultValue={state.email}
          error={errors.email}
          disabled={bloqueado}
          onChange={() => errors.email && setErrors((prev) => ({ ...prev, email: null }))}
          onBlur={(e) => {
            // El valor se lee aquí: el updater corre después y para entonces
            // React ya soltó currentTarget.
            const correo = e.currentTarget.value;
            if (correo) setErrors((prev) => ({ ...prev, email: errorDeCorreo(correo) }));
          }}
        />
        <AuthField
          label="Contraseña"
          type="password"
          name="password"
          autoComplete="current-password"
          placeholder="Tu contraseña"
          autoFocus={expired || Boolean(state.email)}
          error={errors.password}
          disabled={bloqueado}
          onChange={() => errors.password && setErrors((prev) => ({ ...prev, password: null }))}
        />
        <AuthSubmit loading={submitting} disabled={bloqueado}>
          {submitting ? "Entrando…" : "Iniciar sesión"}
        </AuthSubmit>
      </form>
      <AuthFooter>
        ¿No tienes cuenta?{" "}
        <Link to="/signup" className={AUTH_LINK}>
          Crear cuenta
        </Link>
      </AuthFooter>
    </AuthShell>
  );
}
