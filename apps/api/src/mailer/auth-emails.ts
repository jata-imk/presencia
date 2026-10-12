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
export function correoDeVerificacion(user: { name?: string | null; email: string }, url: string): Correo {
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
