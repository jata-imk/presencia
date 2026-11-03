import { Lexer, type Token, type Tokens } from "marked";

// El markdown del modelo vuelto el HTML que Telegram entiende (F11 PR4,
// ADR-030). La respuesta final va como `sendMessage` con `parse_mode: HTML`,
// no como rich message (decisión de Jose tras la sonda: el rich sale "Mensaje
// no compatible" en clientes viejos).
//
// El HTML de Telegram es un subconjunto chico: b, i, s, u, code, pre, a,
// blockquote. No hay encabezados, listas ni tablas, así que:
// - un encabezado es una línea en negritas;
// - una lista son líneas con "•" o con su número;
// - una tabla chica va en <pre>, alineada (cabe en un celular); una ancha se
//   vuelve una lista por fila, porque un <pre> ancho obliga a desplazarse de
//   lado (lo mismo que hace OpenClaw con `markdown.tables`).
//
// Se arma desde los tokens de `marked`, nunca pegando strings: cada etiqueta
// que se abre se cierra, aunque el markdown venga a medias (un draft). Lo que
// el modelo escriba como HTML se escapa: Telegram rechaza el mensaje entero
// por una etiqueta que no conoce.

/** El tope de un mensaje de Telegram (caracteres, después de parsear entidades). */
export const TELEGRAM_MESSAGE_LIMIT = 4096;

/** El ancho (en caracteres de monoespaciado) de una tabla que todavía cabe en un celular. */
export const TABLE_MAX_WIDTH = 40;

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function escapeAttr(text: string): string {
  return escapeHtml(text).replace(/"/g, "&quot;");
}

/** Solo enlaces que Telegram abre y que no ejecutan nada. */
export function safeHref(href: string): string | null {
  try {
    const url = new URL(href);
    return ["http:", "https:", "mailto:", "tg:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Largo visible: un emoji o una letra con acento cuentan como uno. */
function visibleLength(text: string): number {
  return [...text].length;
}

/** El texto de unos tokens, sin marcas (para medir y para el <pre>). */
function plainText(tokens: readonly Token[] | undefined): string {
  if (!tokens) return "";
  return tokens
    .map((t) => {
      if ("tokens" in t && Array.isArray(t.tokens) && t.tokens.length > 0) {
        return plainText(t.tokens);
      }
      if (t.type === "br") return " ";
      return "text" in t && typeof t.text === "string" ? t.text : "";
    })
    .join("");
}

function renderInline(tokens: readonly Token[] | undefined): string {
  if (!tokens) return "";
  return tokens.map(renderInlineToken).join("");
}

function renderInlineToken(token: Token): string {
  switch (token.type) {
    case "text": {
      const t = token as Tokens.Text;
      return t.tokens && t.tokens.length > 0 ? renderInline(t.tokens) : escapeHtml(t.text);
    }
    case "escape":
      return escapeHtml((token as Tokens.Escape).text);
    case "strong":
      return `<b>${renderInline((token as Tokens.Strong).tokens)}</b>`;
    case "em":
      return `<i>${renderInline((token as Tokens.Em).tokens)}</i>`;
    case "del":
      return `<s>${renderInline((token as Tokens.Del).tokens)}</s>`;
    case "codespan":
      return `<code>${escapeHtml((token as Tokens.Codespan).text)}</code>`;
    case "br":
      return "\n";
    case "link": {
      const t = token as Tokens.Link;
      const inner = renderInline(t.tokens) || escapeHtml(t.href);
      const href = safeHref(t.href);
      return href ? `<a href="${escapeAttr(href)}">${inner}</a>` : inner;
    }
    case "image": {
      const t = token as Tokens.Image;
      const href = safeHref(t.href);
      const label = escapeHtml(t.text || "imagen");
      return href ? `<a href="${escapeAttr(href)}">${label}</a>` : label;
    }
    case "checkbox":
      return (token as Tokens.Checkbox).checked ? "☑" : "☐";
    default:
      // html suelto u otro token: su texto tal cual, escapado.
      return escapeHtml("raw" in token && typeof token.raw === "string" ? token.raw : "");
  }
}

function renderList(list: Tokens.List, depth: number): string {
  const indent = "    ".repeat(depth);
  const start = typeof list.start === "number" ? list.start : 1;
  return list.items
    .map((item, i) => {
      const bullet = list.ordered ? `${String(start + i)}.` : "•";
      const lines: string[] = [];
      const inline: string[] = [];
      for (const child of item.tokens) {
        if (child.type === "list") {
          lines.push(renderList(child as Tokens.List, depth + 1));
        } else if (child.type === "text" || child.type === "paragraph") {
          inline.push(renderInline((child as Tokens.Text | Tokens.Paragraph).tokens));
        } else if (child.type === "checkbox") {
          inline.push(renderInlineToken(child));
        } else if (child.type !== "space") {
          inline.push(renderBlock(child, depth + 1));
        }
      }
      return [`${indent}${bullet} ${inline.join(" ").trim()}`, ...lines].join("\n");
    })
    .join("\n");
}

function renderTable(table: Tokens.Table): string {
  const header = table.header.map((cell) => plainText(cell.tokens).trim());
  const rows = table.rows.map((row) => row.map((cell) => plainText(cell.tokens).trim()));
  const widths = header.map((h, j) =>
    Math.max(visibleLength(h), ...rows.map((r) => visibleLength(r[j] ?? ""))),
  );
  const total = widths.reduce((a, b) => a + b, 0) + 3 * (widths.length - 1);

  if (total <= TABLE_MAX_WIDTH) {
    const pad = (text: string, j: number) => {
      const fill = " ".repeat(Math.max(0, widths[j]! - visibleLength(text)));
      return table.align[j] === "right" ? fill + text : text + fill;
    };
    const line = (cells: string[]) =>
      cells
        .map((c, j) => pad(c, j))
        .join(" │ ")
        .trimEnd();
    const separator = widths.map((w) => "─".repeat(w)).join("─┼─");
    return `<pre>${escapeHtml([line(header), separator, ...rows.map(line)].join("\n"))}</pre>`;
  }

  // Ancha: una entrada por fila, con la primera columna de título.
  return table.rows
    .map((row) => {
      const [first, ...rest] = row;
      const title = `<b>${renderInline(first?.tokens)}</b>`;
      const fields = rest.map(
        (cell, j) => `• ${escapeHtml(header[j + 1] ?? "")}: ${renderInline(cell.tokens)}`,
      );
      return [title, ...fields].join("\n");
    })
    .join("\n\n");
}

function renderBlock(token: Token, depth = 0): string {
  switch (token.type) {
    case "paragraph":
      return renderInline((token as Tokens.Paragraph).tokens);
    case "heading":
      return `<b>${renderInline((token as Tokens.Heading).tokens)}</b>`;
    case "code": {
      const t = token as Tokens.Code;
      const lang = (t.lang ?? "").match(/^[\w+-]+/)?.[0];
      const code = escapeHtml(t.text);
      return lang
        ? `<pre><code class="language-${lang}">${code}</code></pre>`
        : `<pre>${code}</pre>`;
    }
    case "blockquote": {
      // Telegram no anida citas: lo de adentro va plano.
      const t = token as Tokens.Blockquote;
      const inner = t.tokens
        .filter((child) => child.type !== "space")
        .map((child) =>
          child.type === "blockquote"
            ? escapeHtml((child as Tokens.Blockquote).text)
            : renderBlock(child, depth),
        )
        .join("\n\n");
      return `<blockquote>${inner}</blockquote>`;
    }
    case "list":
      return renderList(token as Tokens.List, depth);
    case "table":
      return renderTable(token as Tokens.Table);
    case "hr":
      return "———";
    case "text": {
      const t = token as Tokens.Text;
      return t.tokens && t.tokens.length > 0 ? renderInline(t.tokens) : escapeHtml(t.text);
    }
    default:
      return escapeHtml("raw" in token && typeof token.raw === "string" ? token.raw.trim() : "");
  }
}

/** El markdown vuelto bloques de HTML de Telegram, cada uno con sus etiquetas cerradas. */
export function telegramBlocks(markdown: string): string[] {
  return Lexer.lex(markdown)
    .filter((token) => token.type !== "space")
    .map((token) => renderBlock(token))
    .filter((html) => html.trim().length > 0);
}

/** Sin etiquetas: el texto visible (las entidades se quedan, siguen siendo HTML válido). */
export function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "");
}

/** Corta texto plano (ya escapado) en pedazos de hasta `limit`, por espacios. */
function splitPlain(text: string, limit: number): string[] {
  const pieces: string[] = [];
  let rest = text;
  while (rest.length > limit) {
    let cut = rest.lastIndexOf("\n", limit);
    if (cut < limit / 2) cut = rest.lastIndexOf(" ", limit);
    if (cut < limit / 2) cut = limit;
    // Nunca a la mitad de una entidad (&amp;): se retrocede hasta su '&'.
    const amp = rest.lastIndexOf("&", cut);
    if (amp !== -1 && amp > cut - 8 && !rest.slice(amp, cut).includes(";")) cut = amp;
    pieces.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest) pieces.push(rest);
  return pieces;
}

/** Un bloque que no cabe en un mensaje, en pedazos que sí. */
function splitBlock(block: string, limit: number): string[] {
  // Un bloque de código (con o sin lenguaje): varios, cortados por líneas, cada
  // uno con la misma etiqueta de apertura.
  const pre = /^(<pre>(?:<code[^>]*>)?)([\s\S]*?)((?:<\/code>)?<\/pre>)$/.exec(block);
  if (pre) {
    const open = pre[1]!;
    const close = pre[3]!;
    return splitPlain(pre[2]!, limit - open.length - close.length).map(
      (p) => `${open}${p}${close}`,
    );
  }
  // Cualquier otro: pierde el formato solo ese bloque, nunca el mensaje.
  return splitPlain(stripTags(block), limit);
}

/**
 * La respuesta en mensajes de Telegram: bloques juntos mientras quepan, y un
 * bloque demasiado largo en pedazos. Cada mensaje es HTML válido por sí solo.
 */
export function toTelegramMessages(markdown: string, limit = TELEGRAM_MESSAGE_LIMIT): string[] {
  const messages: string[] = [];
  let current = "";
  for (const block of telegramBlocks(markdown).flatMap((b) =>
    b.length > limit ? splitBlock(b, limit) : [b],
  )) {
    const joined = current ? `${current}\n\n${block}` : block;
    if (joined.length <= limit) {
      current = joined;
    } else {
      messages.push(current);
      current = block;
    }
  }
  if (current) messages.push(current);
  return messages;
}

/**
 * El draft mientras llega la respuesta: el mismo HTML, y si ya no cabe en un
 * mensaje, el final del texto, plano (lo de antes se verá en el mensaje final).
 */
export function toTelegramDraft(markdown: string, limit = TELEGRAM_MESSAGE_LIMIT): string {
  const html = telegramBlocks(markdown).join("\n\n");
  if (html.length <= limit) return html;
  const plain = stripTags(html);
  const tail = plain.slice(plain.length - (limit - 200));
  // Desde el siguiente espacio: ni media palabra ni media entidad.
  const from = tail.search(/\s/);
  return `…${from === -1 ? tail : tail.slice(from)}`;
}
