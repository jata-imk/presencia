import { describe, expect, it } from "vitest";
import {
  attachmentWarning,
  filePartsOf,
  formatSize,
  middleEllipsis,
  pastedName,
  preflightError,
  room,
  type PendingAttachment,
} from "./attachments.js";
import { dropVerdict } from "./use-file-drop.js";

// Lo puro de los adjuntos del composer (F10.9).

describe("preflightError", () => {
  it("acepta imágenes, PDF y texto; rechaza otros tipos y lo de más de 25 MB", () => {
    expect(preflightError({ name: "a.png", type: "image/png", size: 10 })).toBeNull();
    expect(preflightError({ name: "notas.md", type: "", size: 10 })).toBeNull();
    expect(preflightError({ name: "a.pdf", type: "application/pdf", size: 10 })).toBeNull();
    expect(preflightError({ name: "a.zip", type: "application/zip", size: 10 })).toMatch(
      /no se puede adjuntar/,
    );
    expect(preflightError({ name: "a.png", type: "image/png", size: 26 * 1024 * 1024 })).toBe(
      "Muy grande: el límite es 25 MB",
    );
  });
});

describe("pastedName", () => {
  it("renombra la captura genérica con la fecha y deja los nombres reales", () => {
    const now = new Date(2026, 9, 18, 10, 42);
    expect(pastedName(new File([""], "image.png", { type: "image/png" }), now)).toBe(
      "captura-20261018-1042.png",
    );
    expect(pastedName(new File([""], "menu.jpg", { type: "image/jpeg" }), now)).toBe("menu.jpg");
  });
});

describe("formato", () => {
  it("peso con un decimal y nombre cortado a la mitad, con la extensión a la vista", () => {
    expect(formatSize(2_516_582)).toBe("2.4 MB");
    expect(formatSize(18_432)).toBe("18 KB");
    const corto = middleEllipsis("guia-de-voz-de-marca-2026.md", 17);
    expect(corto).toHaveLength(17);
    expect(corto.endsWith(".md")).toBe(true);
  });
});

describe("room y dropVerdict", () => {
  it("diez es el tope; un tipo que no se acepta se dice antes de soltar", () => {
    expect(room(8)).toBe(2);
    expect(room(10)).toBe(0);
    expect(dropVerdict(["application/pdf"], 2)).toBe("accept");
    expect(dropVerdict([""], 2)).toBe("accept");
    expect(dropVerdict(["video/quicktime"], 2)).toBe("type");
    // El tipo de un .csv depende del sistema (Excel instalado): no se rechaza.
    expect(dropVerdict(["application/vnd.ms-excel"], 2)).toBe("accept");
    expect(dropVerdict(["application/zip"], 2)).toBe("type");
    expect(dropVerdict(["image/png"], 10)).toBe("limit");
  });
});

describe("filePartsOf y attachmentWarning", () => {
  const base: PendingAttachment = {
    key: "k",
    name: "a.pdf",
    size: 1,
    kind: "pdf",
    previewUrl: null,
    status: "ready",
    progress: 100,
    dto: {
      id: "id",
      kind: "pdf",
      filename: "a.pdf",
      mediaType: "application/pdf",
      sizeBytes: 1,
      url: "/api/attachments/id/content",
      width: null,
      height: null,
      pages: 3,
      scanned: true,
      truncated: false,
      tokenEstimate: 5400,
    },
    error: null,
    retryable: false,
  };

  it("solo viajan los que ya subieron, con el tipo y el nombre de la API", () => {
    expect(filePartsOf([base, { ...base, key: "s", status: "uploading", dto: null }])).toEqual([
      {
        type: "file",
        mediaType: "application/pdf",
        filename: "a.pdf",
        url: "/api/attachments/id/content",
      },
    ]);
  });

  it("el PDF escaneado avisa que cuesta más", () => {
    expect(attachmentWarning(base.dto)).toMatch(/escaneado/);
    expect(attachmentWarning({ ...base.dto!, scanned: false, truncated: true })).toMatch(
      /solo se leyó una parte/,
    );
  });
});
