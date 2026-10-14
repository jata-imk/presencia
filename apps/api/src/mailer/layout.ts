import { env } from "../env.js";

// La plantilla de todos los correos (F10.8.4, Email Template.html de Claude
// Design): tablas de 600px, encabezado plum con el isotipo, el cuerpo, un
// bloque de código o un botón opcionales, la caja "¿No solicitaste esto?" y
// el pie. Es HTML de correo: los clientes no leen CSS variables, así que los
// colores viven aquí, en una sola constante, espejo de los tokens de la web.
//
// Pie mínimo (decisión de Jose): sin ligas legales ni dirección hasta que
// existan las páginas (F13), igual que el checkbox de términos del registro.

const COLORS = {
  plum: "#3D2645",
  plumLight: "#6B4A7A",
  orchid: "#CDB4DB",
  surface: "#F5F0F8",
  card: "#FFFFFF",
  border: "#EBEBEB",
  text: "#1A1A1A",
  body: "#4B5563",
  muted: "#9CA3AF",
  codeBg: "#F8F4FC",
  tipBg: "#FAFAFA",
  tipText: "#6B7280",
  headerWordmark: "#F5F0F8",
  isotipoBg: "#5A3568",
} as const;

const FONT = "Helvetica Neue,Helvetica,Arial,sans-serif";

/** Escapa lo que venga del usuario (su nombre, su correo) antes de meterlo al HTML. */
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export interface EmailContent {
  /** El texto que el cliente muestra junto al asunto. */
  preheader: string;
  /** Saludo: "Hola Ana," o "Hola,". Ya escapado por quien llama si trae datos del usuario. */
  greeting: string;
  /** Párrafos antes del código o el botón. HTML ya escapado. */
  intro: string[];
  /** Código de un solo uso, en grande. */
  code?: { label: string; value: string };
  /** Botón principal. */
  cta?: { label: string; url: string };
  /** Párrafos después del código o el botón. HTML ya escapado. */
  outro?: string[];
  /** La caja gris de seguridad: "¿No solicitaste esto?" y qué hacer. HTML ya escapado. */
  notice: { title: string; body: string };
  /** A quién le llega: va en el pie ("Recibiste este correo porque…"). */
  recipient: string;
  /** Por qué le llega, en el pie: "alguien pidió recuperar la contraseña de". */
  reason: string;
}

function parrafo(html: string, paddingBottom = 20): string {
  return `<tr><td class="body-text" style="font-family:${FONT};font-size:15px;line-height:1.6;color:${COLORS.body};padding-bottom:${String(paddingBottom)}px;">${html}</td></tr>`;
}

function bloqueDeCodigo({ label, value }: NonNullable<EmailContent["code"]>): string {
  // 483917 → "483 917": se lee y se dicta mejor en dos grupos.
  const visible = /^\d{6}$/.test(value)
    ? `${value.slice(0, 3)}&thinsp;${value.slice(3)}`
    : escapeHtml(value);
  return `<tr><td align="center" style="padding-bottom:24px;">
<table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;"><tbody><tr>
<td class="otp-box" align="center" style="background-color:${COLORS.codeBg};border:2px solid ${COLORS.orchid};border-radius:14px;padding:24px 48px;">
<div style="font-family:${FONT};font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:${COLORS.muted};padding-bottom:10px;">${escapeHtml(label)}</div>
<div class="otp-code" style="font-family:'Courier New',Courier,monospace;font-size:40px;font-weight:700;letter-spacing:0.22em;color:${COLORS.plum};line-height:1;padding-bottom:4px;">${visible}</div>
</td></tr></tbody></table>
</td></tr>`;
}

function boton({ label, url }: NonNullable<EmailContent["cta"]>): string {
  return `<tr><td align="center" style="padding-bottom:24px;">
<table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;"><tbody><tr>
<td class="cta" align="center" style="background-color:${COLORS.plum};border-radius:10px;">
<a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 32px;font-family:${FONT};font-size:15px;font-weight:600;color:${COLORS.card};text-decoration:none;">${escapeHtml(label)}</a>
</td></tr></tbody></table>
</td></tr>`;
}

export function renderEmail(content: EmailContent): string {
  // Versión clara del isotipo: el de la web es negro y se pinta con
  // mask-image, que los clientes de correo no soportan.
  const isotipo = `${env.WEB_URL}/assets/isotipo-correo.png`;
  return `<!DOCTYPE html>
<html lang="es" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<style>
  @media (prefers-color-scheme: dark) {
    .email-outer { background-color: #1A1A1A !important; }
    .email-body { background-color: #262626 !important; border-color: #333333 !important; }
    .email-footer { background-color: #1A1A1A !important; }
    .hdr-bg { background-color: #2D1F35 !important; }
    .body-text { color: #D1D5DB !important; }
    .footer-text { color: #6B7280 !important; }
    .otp-box { background-color: #2D1F35 !important; border-color: ${COLORS.plumLight} !important; }
    .otp-code { color: #E9D8F4 !important; }
    .tip-box { background-color: #1F2937 !important; border-color: #374151 !important; }
    .tip-text { color: #9CA3AF !important; }
    .divider { background-color: #333333 !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;">
<table class="email-outer" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COLORS.surface};min-width:320px;"><tbody><tr>
<td align="center" style="padding:40px 16px;">
<div style="display:none;font-size:1px;color:${COLORS.surface};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(content.preheader)}</div>
<table class="email-body" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:${COLORS.card};border-radius:20px;overflow:hidden;border:1px solid ${COLORS.border};"><tbody>
<tr><td class="hdr-bg" align="center" style="background-color:${COLORS.plum};padding:36px 40px 32px;">
<table width="100%" cellpadding="0" cellspacing="0" border="0"><tbody>
<tr><td align="center" style="padding-bottom:12px;">
<table cellpadding="0" cellspacing="0" border="0"><tbody><tr><td align="center" style="width:56px;height:56px;background-color:${COLORS.isotipoBg};border-radius:14px;">
<img src="${escapeHtml(isotipo)}" width="32" height="32" alt="" style="display:block;margin:12px auto;border:0;">
</td></tr></tbody></table>
</td></tr>
<tr><td align="center"><span style="font-family:${FONT};font-size:26px;font-weight:700;color:${COLORS.headerWordmark};letter-spacing:0.02em;">Presencia</span></td></tr>
</tbody></table>
</td></tr>
<tr><td style="padding:36px 40px 32px;">
<table width="100%" cellpadding="0" cellspacing="0" border="0"><tbody>
<tr><td class="body-text" style="font-family:${FONT};font-size:16px;color:${COLORS.text};padding-bottom:8px;">${content.greeting}</td></tr>
${content.intro.map((p, i) => parrafo(p, i === content.intro.length - 1 ? 28 : 16)).join("\n")}
${content.code ? bloqueDeCodigo(content.code) : ""}
${content.cta ? boton(content.cta) : ""}
${(content.outro ?? []).map((p) => parrafo(p)).join("\n")}
<tr><td style="padding-bottom:8px;">
<table class="tip-box" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COLORS.tipBg};border:1px solid ${COLORS.border};border-radius:10px;"><tbody><tr>
<td class="tip-text" style="padding:14px 16px;font-family:${FONT};font-size:13px;line-height:1.5;color:${COLORS.tipText};"><strong>${content.notice.title}</strong> ${content.notice.body}</td>
</tr></tbody></table>
</td></tr>
</tbody></table>
</td></tr>
<tr><td style="padding:0 40px;"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tbody><tr><td class="divider" style="height:1px;background-color:${COLORS.border};font-size:1px;line-height:1px;">&nbsp;</td></tr></tbody></table></td></tr>
<tr><td class="email-footer" style="background-color:${COLORS.tipBg};padding:24px 40px 28px;">
<table width="100%" cellpadding="0" cellspacing="0" border="0"><tbody>
<tr><td class="footer-text" align="center" style="font-family:${FONT};font-size:12px;line-height:1.6;color:${COLORS.muted};padding-bottom:12px;">Recibiste este correo porque ${content.reason} <strong>${escapeHtml(content.recipient)}</strong> en Presencia.</td></tr>
<tr><td align="center"><span style="font-family:${FONT};font-size:14px;font-weight:700;color:${COLORS.orchid};letter-spacing:0.06em;">Presencia</span></td></tr>
</tbody></table>
</td></tr>
</tbody></table>
</td></tr></tbody></table>
</body>
</html>`;
}
