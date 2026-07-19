import { env } from "../env.js";

// Correo transaccional vía Zoho ZeptoMail (API HTTP, sin dependencias).
// El proveedor es intercambiable: esta interfaz es nuestra, ZeptoMail
// vive solo dentro de este archivo.

interface SendMailInput {
  to: string;
  subject: string;
  html: string;
}

export async function sendMail({ to, subject, html }: SendMailInput): Promise<void> {
  const res = await fetch("https://api.zeptomail.com/v1.1/email", {
    method: "POST",
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
