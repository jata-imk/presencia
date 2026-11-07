import { env } from "../env.js";

// Correo transaccional vía Zoho ZeptoMail (API HTTP, sin dependencias).
// El proveedor es intercambiable: esta interfaz es nuestra, ZeptoMail
// vive solo dentro de este archivo.

interface SendMailInput {
  to: string;
  subject: string;
  html: string;
  /**
   * Techo de la llamada. Sin él, `fetch` espera lo que el sistema operativo
   * aguante. Lo usan las alertas de operación (F12.8), que corren dentro de un
   * job con su propio techo y no pueden quedarse colgadas en un correo.
   */
  timeoutMs?: number;
}

export async function sendMail({ to, subject, html, timeoutMs }: SendMailInput): Promise<void> {
  const res = await fetch("https://api.zeptomail.com/v1.1/email", {
    method: "POST",
    ...(timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
    headers: {
      Authorization: `Zoho-enczapikey ${env.ZEPTOMAIL_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: { address: env.MAIL_FROM, name: "Presencia" },
      to: [{ email_address: { address: to } }],
      subject,
      htmlbody: html,
    }),
  });

  if (!res.ok) {
    throw new Error(`ZeptoMail respondió ${res.status}: ${await res.text()}`);
  }
}
