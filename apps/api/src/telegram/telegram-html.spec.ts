import { describe, expect, it } from "vitest";
import {
  TELEGRAM_MESSAGE_LIMIT,
  telegramBlocks,
  toTelegramDraft,
  toTelegramMessages,
} from "./telegram-html.js";

// El markdown del modelo como HTML de Telegram (F11 PR4): lo que Telegram no
// tiene (encabezados, listas, tablas) se traduce, y todo sale escapado y con
// sus etiquetas cerradas, también a medias o cortado en varios mensajes.

const html = (md: string) => telegramBlocks(md).join("\n\n");

/** Cada etiqueta que se abre se cierra, en orden. */
function balanced(text: string): boolean {
  const stack: string[] = [];
  for (const m of text.matchAll(/<(\/?)([a-z]+)[^>]*>/g)) {
    if (m[1]) {
      if (stack.pop() !== m[2]) return false;
    } else stack.push(m[2]!);
  }
  return stack.length === 0;
}

describe("telegramBlocks", () => {
  it("negritas, cursivas, tachado, código y enlaces", () => {
    expect(html("**Hola** _tú_ ~~no~~ `a<b` [Diario](https://diario.mx/x?a=1&b=2)")).toBe(
      '<b>Hola</b> <i>tú</i> <s>no</s> <code>a&lt;b</code> <a href="https://diario.mx/x?a=1&amp;b=2">Diario</a>',
    );
  });

  it("escapa lo que el modelo escriba como HTML y no deja enlaces raros", () => {
    expect(html("Usa <div> & listo")).toBe("Usa &lt;div&gt; &amp; listo");
    expect(html("[clic](javascript:alert(1))")).toBe("clic");
  });

  it("un encabezado es una línea en negritas", () => {
    expect(html("## Ideas para hoy")).toBe("<b>Ideas para hoy</b>");
  });

  it("listas con viñeta, con número y anidadas", () => {
    expect(html("- uno\n  - dos\n- **tres**")).toBe("• uno\n    • dos\n• <b>tres</b>");
    expect(html("3. a\n4. b")).toBe("3. a\n4. b");
    expect(html("- [x] hecho\n- [ ] pendiente")).toBe("• ☑ hecho\n• ☐ pendiente");
  });

  it("código con su lenguaje, escapado", () => {
    expect(html("```js\nif (a < b) {}\n```")).toBe(
      '<pre><code class="language-js">if (a &lt; b) {}</code></pre>',
    );
  });

  it("una tabla chica va alineada en <pre>", () => {
    const out = html("| Red | Posts |\n|---|--:|\n| IG | 3 |\n| TikTok | 12 |");
    expect(out).toBe("<pre>Red    │ Posts\n───────┼──────\nIG     │     3\nTikTok │    12</pre>");
  });

  it("una tabla ancha se vuelve una lista por fila", () => {
    const md =
      "| Día | Idea | Formato |\n|---|---|---|\n" +
      "| Lunes | Detrás de cámaras del primer café del día en el local | Reel |\n" +
      "| Martes | Receta de marquesitas con un twist | Carrusel |";
    expect(html(md)).toBe(
      "<b>Lunes</b>\n• Idea: Detrás de cámaras del primer café del día en el local\n• Formato: Reel\n\n" +
        "<b>Martes</b>\n• Idea: Receta de marquesitas con un twist\n• Formato: Carrusel",
    );
  });

  it("una cita, sin anidar", () => {
    expect(html("> Lo dijo **ella**")).toBe("<blockquote>Lo dijo <b>ella</b></blockquote>");
  });

  it("el markdown a medias de un draft sale cerrado", () => {
    for (const md of ["**Hola", "Texto con `código", "```py\nprint(1)", "| A | B |\n|---"]) {
      expect(balanced(html(md))).toBe(true);
    }
  });
});

describe("toTelegramMessages", () => {
  it("lo corto va en un solo mensaje", () => {
    expect(toTelegramMessages("Hola\n\n- uno")).toEqual(["Hola\n\n• uno"]);
  });

  it("lo largo se corta por bloques, cada mensaje cabe y es HTML válido", () => {
    const parrafo = `**Idea.** ${"Una oración más para alargar el texto. ".repeat(40)}`;
    const md = Array.from({ length: 8 }, () => parrafo).join("\n\n");
    const messages = toTelegramMessages(md);
    expect(messages.length).toBeGreaterThan(1);
    for (const m of messages) {
      expect(m.length).toBeLessThanOrEqual(TELEGRAM_MESSAGE_LIMIT);
      expect(balanced(m)).toBe(true);
    }
  });

  it("un bloque de código enorme se reparte en varios <pre>", () => {
    const code = Array.from({ length: 400 }, (_, i) => `linea_${String(i)} = ${String(i)};`).join(
      "\n",
    );
    const messages = toTelegramMessages(`\`\`\`\n${code}\n\`\`\``);
    expect(messages.length).toBeGreaterThan(1);
    for (const m of messages) {
      expect(m.length).toBeLessThanOrEqual(TELEGRAM_MESSAGE_LIMIT);
      expect(m.startsWith("<pre>") && m.endsWith("</pre>")).toBe(true);
    }
  });

  it("un párrafo enorme pierde el formato solo él, y no corta una entidad", () => {
    const md = `${"Tom & Jerry ".repeat(600)}`;
    const messages = toTelegramMessages(md);
    for (const m of messages) {
      expect(m.length).toBeLessThanOrEqual(TELEGRAM_MESSAGE_LIMIT);
      expect(m).not.toMatch(/&(?!amp;)/);
    }
  });
});

describe("toTelegramDraft", () => {
  it("cabe: el mismo HTML que el mensaje final", () => {
    expect(toTelegramDraft("**Va**")).toBe("<b>Va</b>");
  });

  it("no cabe: el final del texto, plano y dentro del tope", () => {
    const draft = toTelegramDraft(`**Inicio** ${"palabra ".repeat(1000)}fin`);
    expect(draft.length).toBeLessThanOrEqual(TELEGRAM_MESSAGE_LIMIT);
    expect(draft.startsWith("…")).toBe(true);
    expect(draft.endsWith("fin")).toBe(true);
    expect(draft).not.toContain("<b>");
  });
});
