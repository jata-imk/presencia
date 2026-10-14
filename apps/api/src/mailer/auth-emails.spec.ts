import { beforeAll, describe, expect, it } from "vitest";

// env.ts valida el entorno al importarse: import dinámico después de cargar
// el .env (en CI ya viene en process.env).
let mod: typeof import("./auth-emails.js");
let layout: typeof import("./layout.js");

beforeAll(async () => {
  try {
    process.loadEnvFile("../../.env");
  } catch {
    // sin .env: se usa el process.env tal cual (CI)
  }
  mod = await import("./auth-emails.js");
  layout = await import("./layout.js");
});

describe("correos de acceso (F10.8.4)", () => {
  it("escapa el nombre y el correo del usuario", () => {
    const { html } = mod.correoDeVerificacion(
      { name: `<img src=x onerror="alert(1)">`, email: "a&b@test.local" },
      "https://api.test/verify?token=1&callbackURL=x",
    );
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).toContain("a&amp;b@test.local");
    expect(html).toContain('href="https://api.test/verify?token=1&amp;callbackURL=x"');
  });

  it("no arrastra datos de relleno del mock", () => {
    const { html } = mod.correoDeCuentaExistente({ name: null, email: "dev@presencia.local" });
    for (const relleno of [
      "presencia.ai",
      "placeholder",
      "Ciudad de México",
      "usuario@ejemplo.com",
    ]) {
      expect(html).not.toContain(relleno);
    }
    expect(html).toContain("Hola:");
  });

  it("el código de 6 dígitos sale en dos grupos y lo demás se escapa", () => {
    const conCodigo = layout.renderEmail({
      preheader: "p",
      greeting: "Hola:",
      intro: ["i"],
      code: { label: "Tu código", value: "483917" },
      notice: { title: "t", body: "b" },
      recipient: "x@test.local",
      reason: "r",
    });
    expect(conCodigo).toContain("483&thinsp;917");
    expect(layout.escapeHtml(`"<'&>`)).toBe("&quot;&lt;&#39;&amp;&gt;");
  });
});
