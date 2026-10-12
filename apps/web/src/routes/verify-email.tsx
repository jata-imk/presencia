import { MailCheck } from "lucide-react";
import { Link, useLocation } from "react-router";
import { AUTH_LINK, AuthFooter, AuthHeading, AuthShell } from "../components/auth/AuthShell.js";

// Después de crear la cuenta (F10.8.4: misma tarjeta que el resto del acceso).
export function VerifyEmailPage() {
  const email = (useLocation().state as { email?: string } | null)?.email;
  return (
    <AuthShell>
      <span className="flex size-13 items-center justify-center rounded-[14px] bg-info-bg text-info-fg">
        <MailCheck size={24} strokeWidth={1.6} aria-hidden />
      </span>
      <AuthHeading
        align="start"
        title="Revisa tu correo"
        subtitle={
          <>
            Te mandamos un link de confirmación
            {email ? (
              <>
                {" "}
                a <strong className="text-brand">{email}</strong>
              </>
            ) : null}
            . Ábrelo para activar tu cuenta y entrarás directo a tus chats.
          </>
        }
      />
      <p className="text-xs text-fg-muted">
        Si no lo ves en unos minutos, busca en la carpeta de spam o promociones.
      </p>
      <AuthFooter>
        ¿Ya confirmaste?{" "}
        <Link to="/login" state={email ? { email } : undefined} className={AUTH_LINK}>
          Inicia sesión
        </Link>
      </AuthFooter>
    </AuthShell>
  );
}
