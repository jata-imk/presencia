import { env } from "../env.js";
import { escapeHtml, renderEmail } from "./layout.js";

// Los correos de acceso (F10.8.4), todos sobre la misma plantilla
// (layout.ts). Cada uno devuelve asunto y HTML; quien los manda es auth.ts.

interface Correo {
  subject: string;
  html: string;
}

function saludo(name: string | null | undefined): string {
  const nombre = name?.trim();
  return nombre ? `Hola, ${escapeHtml(nombre)}:` : "Hola:";
}

/** Confirmar el correo al registrarse: botón con el link de Better Auth. */
export function correoDeVerificacion(
  user: { name?: string | null; email: string },
  url: string,
): Correo {
  return {
    subject: "Confirma tu correo para empezar a usar Presencia",
    html: renderEmail({
      preheader: "Un clic y tu cuenta queda lista.",
      greeting: saludo(user.name),
      intro: ["Gracias por registrarte en Presencia. Confirma tu correo para activar tu cuenta:"],
      cta: { label: "Confirmar mi correo", url },
      outro: ["Al confirmarlo entras directo a tus chats."],
      notice: {
        title: "¿No creaste esta cuenta?",
        body: "Ignora este correo: sin confirmarla, la cuenta no se activa.",
      },
      recipient: user.email,
      reason: "alguien creó una cuenta con",
    }),
  };
}

/** El código para recuperar la contraseña (Email Template.html, tal cual el mock). */
export function correoDeRecuperacion(email: string, otp: string): Correo {
  return {
    subject: `${otp} es tu código para recuperar tu contraseña de Presencia`,
    html: renderEmail({
      preheader: "Tu código para recuperar el acceso a Presencia. Expira en 10 minutos.",
      greeting: "Hola:",
      intro: [
        "Recibimos una solicitud para cambiar la contraseña de tu cuenta en Presencia. Usa este código para continuar:",
      ],
      code: { label: "Tu código", value: otp },
      outro: ["Escríbelo en la pantalla de recuperación. <strong>Expira en 10 minutos.</strong>"],
      notice: {
        title: "¿No lo pediste?",
        body: "Ignora este correo: tu contraseña no cambia mientras nadie use el código.",
      },
      recipient: email,
      reason: "alguien pidió recuperar la contraseña de",
    }),
  };
}

/**
 * Alguien intentó registrarse con un correo que ya tiene cuenta. La pantalla
 * no lo dice (no revela qué correos están registrados): se le avisa al dueño.
 */
export function correoDeCuentaExistente(user: { name?: string | null; email: string }): Correo {
  return {
    subject: "Ya tienes una cuenta en Presencia",
    html: renderEmail({
      preheader: "Alguien intentó crear otra cuenta con tu correo.",
      greeting: saludo(user.name),
      intro: [
        "Alguien intentó crear una cuenta en Presencia con este correo, pero ya tienes una. Si fuiste tú, entra con tu contraseña:",
      ],
      cta: { label: "Iniciar sesión", url: `${env.WEB_URL}/login` },
      notice: {
        title: "¿No fuiste tú?",
        body: "No tienes que hacer nada: tu cuenta y tu contraseña siguen igual.",
      },
      recipient: user.email,
      reason: "alguien intentó registrarse con",
    }),
  };
}
