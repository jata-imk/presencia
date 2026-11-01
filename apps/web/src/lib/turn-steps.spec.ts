import { describe, expect, it } from "vitest";
import type { ReadLinkOutput, ViewAttachmentOutput, WebSearchOutput } from "@presencia/shared";
import type { CardToolPart, ViewToolPart, WebToolPart } from "./chat-types.js";
import { domainOfUrl, stepsExpandable, stepsHeader, turnSteps } from "./turn-steps.js";

// F10.10: los pasos de una respuesta (buscar, leer, crear borradores) en una
// sola lista, y el encabezado que la resume.

const search = (
  consulta: string,
  output?: Partial<WebSearchOutput>,
  state: WebToolPart["state"] = "output-available",
) =>
  ({
    type: "tool-buscar_en_web",
    toolCallId: `s-${consulta}`,
    state,
    input: { consulta },
    output: { searchId: "s", consulta, estado: "ok", resultados: [{}, {}, {}], ...output },
  }) as unknown as WebToolPart;

const read = (
  url: string,
  output?: Partial<ReadLinkOutput>,
  state: WebToolPart["state"] = "output-available",
) =>
  ({
    type: "tool-leer_enlace",
    toolCallId: `r-${url}`,
    state,
    input: { url },
    output: {
      readId: "r",
      url,
      urlFinal: url,
      titulo: "Nota",
      dominio: new URL(url).hostname.replace(/^www\./, ""),
      estado: "ok",
      truncado: false,
      soloDescripcion: false,
      ...output,
    },
  }) as unknown as WebToolPart;

const card = (state: CardToolPart["state"] = "output-available") =>
  ({
    type: "tool-crear_borrador_visual",
    toolCallId: "c1",
    state,
    input: { network: "instagram" },
    output: { cardId: "x", network: "instagram", status: "draft", content: {} },
  }) as unknown as CardToolPart;

describe("turnSteps + stepsHeader", () => {
  it("en vivo, el encabezado es el paso que corre", () => {
    const steps = turnSteps(
      [search("precio del café"), read("https://www.poresto.com/x", {}, "input-available")],
      true,
    );
    expect(steps.map((s) => s.text)).toEqual(["Busqué 'precio del café'", "Leyendo poresto.com…"]);
    expect(steps[0]!.meta).toBe("3 resultados");
    expect(stepsHeader(steps)).toEqual({ state: "live", label: "Leyendo poresto.com…" });
  });

  it("al terminar, resume lo que sí pasó en una sola frase, borradores incluidos", () => {
    const steps = turnSteps(
      [search("café"), read("https://a.mx/1"), read("https://b.mx/2"), card()],
      false,
    );
    expect(stepsHeader(steps)).toEqual({
      state: "done",
      label: "Busqué 1 vez, leí 2 páginas y creé 1 borrador",
    });
  });

  it("solo borradores, como antes de F10.10", () => {
    expect(stepsHeader(turnSteps([card(), card()], false))?.label).toBe("Creé 2 borradores");
  });

  it("un enlace que no se pudo leer dice por qué, sin lista que abrir", () => {
    const steps = turnSteps(
      [read("https://www.instagram.com/reel/x", { estado: "requiere_sesion", titulo: null })],
      false,
    );
    expect(stepsHeader(steps)).toEqual({
      state: "fail",
      label: "No pude leer instagram.com: pide iniciar sesión",
    });
    expect(stepsExpandable(steps)).toBe(false);
  });

  it("fuera de las redes, el mismo estado es cuenta o pago", () => {
    const [s] = turnSteps(
      [read("https://www.elfinanciero.com.mx/x", { estado: "requiere_sesion" })],
      false,
    );
    expect(s!.text).toBe("No pude leer elfinanciero.com.mx: pide cuenta o pago");
  });

  it("el tope del mensaje se dice en el encabezado", () => {
    const steps = turnSteps(
      [
        read("https://a.mx"),
        read("https://b.mx"),
        read("https://c.mx"),
        read("https://www.milenio.com/x", { estado: "limite" }),
      ],
      false,
    );
    expect(steps.at(-1)).toMatchObject({
      state: "skip",
      text: "No abrí milenio.com: llegué al tope de 3 páginas",
    });
    expect(stepsHeader(steps)).toEqual({
      state: "limit",
      label: "Llegué al tope de 3 páginas en este mensaje",
    });
  });

  it("detenido a mitad de una lectura", () => {
    const steps = turnSteps(
      [search("café"), read("https://www.poresto.com/x", {}, "input-available")],
      false,
    );
    expect(steps.at(-1)).toMatchObject({ state: "stop", text: "Lectura detenida: poresto.com" });
    expect(stepsHeader(steps)).toEqual({
      state: "stop",
      label: "Detuviste la lectura de poresto.com",
    });
  });

  it("una lectura a medias se marca", () => {
    const [largo, desc] = turnSteps(
      [
        read("https://inegi.org.mx/x", { truncado: true }),
        read("https://gob.mx/y", { soloDescripcion: true }),
      ],
      false,
    );
    expect(largo).toMatchObject({
      state: "part",
      text: "Leí solo una parte de inegi.org.mx",
      meta: "es muy larga",
    });
    expect(desc).toMatchObject({ state: "part", text: "De gob.mx solo había la descripción" });
  });

  it("un buscador caído y una búsqueda sin resultados no son errores nuestros", () => {
    const steps = turnSteps(
      [
        search("a", { estado: "no_disponible", resultados: [] }),
        search("b", { estado: "sin_resultados", resultados: [] }),
      ],
      false,
    );
    expect(steps.map((s) => s.state)).toEqual(["fail", "fail"]);
    expect(stepsHeader(steps)?.label).toBe("Busqué 1 vez");
  });

  it("con un solo paso de la web, el encabezado es el paso mismo", () => {
    const one = (part: Parameters<typeof turnSteps>[0][number]) =>
      stepsHeader(turnSteps([part], false));
    expect(one(search("café en Mérida"))).toEqual({
      state: "done",
      label: "Busqué 'café en Mérida' · 3 resultados",
    });
    expect(one(read("https://www.eluniversal.com.mx/x"))).toEqual({
      state: "done",
      label: "Leí eluniversal.com.mx",
    });
    expect(one(read("https://inegi.org.mx/x", { truncado: true }))).toEqual({
      state: "done",
      label: "Leí solo una parte de inegi.org.mx · es muy larga",
    });
    // Sin resultados no es una búsqueda que salió bien.
    expect(one(search("x", { estado: "sin_resultados", resultados: [] }))).toEqual({
      state: "fail",
      label: "Busqué 'x': sin resultados",
    });
  });

  it("el tope no tapa un borrador creado", () => {
    const steps = turnSteps(
      [
        read("https://a.mx"),
        read("https://b.mx"),
        read("https://c.mx"),
        read("https://d.mx", { estado: "limite" }),
        card(),
      ],
      false,
    );
    expect(stepsHeader(steps)).toEqual({ state: "done", label: "Leí 3 páginas y creé 1 borrador" });
  });

  it("un estado de lectura que esta versión no conoce no tumba el mensaje", () => {
    const [step] = turnSteps([read("https://a.mx/x", { estado: "nuevo_estado" as "ok" })], false);
    expect(step).toMatchObject({ state: "fail", text: "No pude leer a.mx" });
  });
});

const view = (
  adjunto: string,
  output?: Partial<ViewAttachmentOutput>,
  state: ViewToolPart["state"] = "output-available",
) =>
  ({
    type: "tool-ver_adjunto",
    toolCallId: `v-${adjunto}`,
    state,
    input: { adjunto },
    output: {
      attachmentId: "a1",
      nombre: "fachada.png",
      tipo: "image",
      paginas: null,
      totalPaginas: null,
      estado: "ok",
      recortado: false,
      ...output,
    },
  }) as unknown as ViewToolPart;

const ID = "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed";

describe("F10.11: volver a ver un adjunto", () => {
  it("un solo paso: el encabezado es el paso, con su nombre", () => {
    const steps = turnSteps([view(ID)], false);
    expect(stepsHeader(steps)).toEqual({ state: "done", label: "Volví a ver fachada.png" });
    expect(stepsExpandable(steps)).toBe(false);
  });

  it("en vivo, nunca enseña el id que pidió el modelo", () => {
    expect(turnSteps([view(ID, {}, "input-available")], true)[0]!.text).toBe(
      "Volviendo a ver un adjunto…",
    );
    expect(turnSteps([view("menu.pdf", {}, "input-available")], true)[0]!.text).toBe(
      "Volviendo a ver menu.pdf…",
    );
  });

  it("las páginas de un PDF van al lado; a medias se marca", () => {
    const [pagina] = turnSteps([view(ID, { nombre: "menu.pdf", paginas: "3-5" })], false);
    expect(pagina).toMatchObject({ state: "ok", text: "Volví a ver menu.pdf", meta: "págs. 3–5" });
    const [corto] = turnSteps(
      [view(ID, { nombre: "menu.pdf", paginas: "1-8", recortado: true })],
      false,
    );
    expect(corto).toMatchObject({ state: "part", meta: "págs. 1–8, solo una parte" });
  });

  it("lo que no se pudo ver dice por qué, sin rojo", () => {
    const steps = turnSteps(
      [
        view("otro.png", { estado: "no_encontrado", attachmentId: null, nombre: "otro.png" }),
        view(ID, { estado: "pagina_no_disponible", nombre: "menu.pdf", paginas: "9" }),
      ],
      false,
    );
    expect(steps.map((s) => [s.state, s.text, s.reason])).toEqual([
      ["fail", "No encontré otro.png en este chat", "sin_adjunto"],
      ["fail", "No pude ver pág. 9 de menu.pdf", "sin_pagina"],
    ]);
  });

  it("el resumen lo cuenta junto con lo demás", () => {
    const steps = turnSteps([view(ID), read("https://a.mx/1"), card()], false);
    expect(stepsHeader(steps)?.label).toBe("Leí 1 página, volví a ver 1 adjunto y creé 1 borrador");
  });

  it("el tope y el detenido tienen su propio encabezado", () => {
    const tope = turnSteps([view(ID), view("b.png", { estado: "limite", nombre: "b.png" })], false);
    expect(stepsHeader(tope)).toEqual({
      state: "limit",
      label: "Llegué al tope de 3 adjuntos en este mensaje",
    });
    const detenido = turnSteps([view("menu.pdf", {}, "input-available")], false);
    expect(stepsHeader(detenido)).toEqual({
      state: "stop",
      label: "Detuviste cuando volvía a ver menu.pdf",
    });
  });
});

describe("domainOfUrl", () => {
  it("el dominio sin www, como lo guarda la API", () => {
    expect(domainOfUrl("https://www.eluniversal.com.mx/nota?x=1")).toBe("eluniversal.com.mx");
  });

  it("una IP o localhost da el host, nunca la URL con su ruta o su token", () => {
    expect(domainOfUrl("http://127.0.0.1:8080/admin?token=abc")).toBe("127.0.0.1");
    expect(domainOfUrl("http://localhost:3000/x")).toBe("localhost");
    expect(domainOfUrl("no es una url")).toBe("la página");
  });
});
