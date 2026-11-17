import { describe, expect, it } from "vitest";
import { downloadNameFor } from "./download-name.js";

// El nombre con el que se guarda una imagen al descargarla de Biblioteca (F12).

const ID = "0380d148-637f-4bb0-b502-a80e359b4b77";

describe("downloadNameFor", () => {
  it("usa el nombre con el que el creator la subió", () => {
    expect(
      downloadNameFor({
        id: ID,
        mimeType: "image/png",
        metadata: { originalName: "mi foto de Mérida.png" },
      }),
    ).toBe("mi foto de Mérida.png");
  });

  it("le pone la extensión de lo que de verdad se guardó", () => {
    // Subió un HEIC o un GIF y se recodificó: el archivo ya no es eso.
    expect(
      downloadNameFor({
        id: ID,
        mimeType: "image/jpeg",
        metadata: { originalName: "IMG_4821.HEIC" },
      }),
    ).toBe("IMG_4821.jpg");
  });

  it("no se come los puntos que no son una extensión de imagen", () => {
    expect(
      downloadNameFor({
        id: ID,
        mimeType: "image/jpeg",
        metadata: { originalName: "Captura 2026-11-14 a las 10.30.15" },
      }),
    ).toBe("Captura 2026-11-14 a las 10.30.15.jpg");
    expect(
      downloadNameFor({ id: ID, mimeType: "image/png", metadata: { originalName: "logo.v2" } }),
    ).toBe("logo.v2.png");
    expect(
      downloadNameFor({ id: ID, mimeType: "image/png", metadata: { originalName: "logo.v2.PNG" } }),
    ).toBe("logo.v2.png");
  });

  it("arma uno con el id si la dibujó un generador o el nombre viene vacío", () => {
    expect(downloadNameFor({ id: ID, mimeType: "image/png", metadata: {} })).toBe(
      "presencia-0380d148.png",
    );
    expect(
      downloadNameFor({ id: ID, mimeType: "image/jpeg", metadata: { originalName: "  " } }),
    ).toBe("presencia-0380d148.jpg");
    // Un nombre que es pura extensión no deja base.
    expect(
      downloadNameFor({ id: ID, mimeType: "image/png", metadata: { originalName: ".png" } }),
    ).toBe("presencia-0380d148.png");
  });
});
