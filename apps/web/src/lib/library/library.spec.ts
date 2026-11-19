import { describe, expect, it } from "vitest";
import type { LibraryAssetDto, LibraryCardRef } from "@presencia/shared";
import {
  NO_FILTERS,
  activeShortcut,
  assetName,
  chatLabel,
  deleteDialogCopy,
  deletePlan,
  deleteResultToast,
  detailDate,
  displayCard,
  formatLabel,
  groupByDate,
  inUseLabel,
  libraryDropVerdict,
  libraryFileProblem,
  networkLabel,
  queryString,
  shortDate,
  shortcutFilters,
  statusKind,
  toQuery,
  uploadsTitle,
  versionLabel,
  viewCardTarget,
  withFilter,
} from "./library.js";

// Todas las fechas van explícitas (`now` es un argumento): ningún caso
// depende del día en que corra la prueba.
const TZ = "America/Merida"; // UTC-6, sin horario de verano
const NOW = new Date("2026-11-17T18:00:00.000Z"); // martes 17, 12:00 en Mérida

const card = (over: Partial<LibraryCardRef> = {}): LibraryCardRef => ({
  id: "card-1",
  chatId: "chat-1",
  network: "instagram",
  status: "draft",
  ...over,
});

const asset = (over: Partial<LibraryAssetDto> = {}): LibraryAssetDto => ({
  id: "asset-1",
  kind: "image",
  origin: "generated",
  mimeType: "image/png",
  sizeBytes: 1_800_000,
  width: 1080,
  height: 1350,
  alt: null,
  originalName: null,
  createdAt: "2026-11-17T16:42:00.000Z",
  prompt: "Taza de café sobre mesa de madera",
  instruction: null,
  parentAssetId: null,
  chat: { id: "chat-1", title: "Café de especialidad" },
  bornInCard: card(),
  uses: [],
  state: "discarded",
  ...over,
});

describe("atajos y filtros", () => {
  it("cada atajo se reconoce a sí mismo", () => {
    for (const shortcut of ["week", "ready", "uploads", "published"] as const) {
      expect(activeShortcut(shortcutFilters(shortcut, NOW))).toBe(shortcut);
    }
  });

  it("un filtro de más ya no es el atajo", () => {
    const ready = shortcutFilters("ready", NOW);
    expect(activeShortcut(withFilter(ready, "network", "instagram"))).toBeNull();
    expect(activeShortcut(NO_FILTERS)).toBeNull();
  });

  it('"Generadas esta semana" pide generadas desde hace 7 días', () => {
    expect(toQuery(shortcutFilters("week", NOW), "")).toEqual({
      origin: "generated",
      createdFrom: "2026-11-10T18:00:00.000Z",
    });
  });

  it('elegir "Subida por ti" apaga "Generadas esta semana"', () => {
    const next = withFilter(shortcutFilters("week", NOW), "origin", "uploaded");
    expect(next.generatedSince).toBeNull();
    expect(toQuery(next, "")).toEqual({ origin: "uploaded" });
  });

  it("los atajos de publicadas y listas piden elegidas, como su contador", () => {
    expect(toQuery(shortcutFilters("published", NOW), "")).toEqual({
      state: "chosen",
      cardStatus: "published",
    });
    expect(toQuery(shortcutFilters("ready", NOW), "")).toEqual({
      state: "chosen",
      cardStatus: "draft",
    });
  });

  it("la consulta es estable sin importar el orden de los filtros", () => {
    const a = queryString(toQuery({ ...NO_FILTERS, network: "x", origin: "uploaded" }, " taller "));
    const b = queryString({ q: "taller", origin: "uploaded", network: "x" });
    expect(a).toBe(b);
    expect(a).toBe("network=x&origin=uploaded&q=taller");
    expect(queryString(toQuery(NO_FILTERS, "   "))).toBe("");
  });
});

describe("grupos de fecha", () => {
  it("separa hoy, esta semana y el mes, en la zona del creator", () => {
    const groups = groupByDate(
      [
        asset({ id: "hoy", createdAt: "2026-11-17T16:42:00.000Z" }),
        // 05:30 UTC del 17 todavía es el 16 a las 23:30 en Mérida.
        asset({ id: "ayer", createdAt: "2026-11-17T05:30:00.000Z" }),
        // Hace 7 días de calendario pero 6 días y 22 horas: sigue dentro de
        // la ventana del atajo "Generadas esta semana", así que va con ella.
        asset({ id: "casi-7", createdAt: "2026-11-10T20:00:00.000Z" }),
        asset({ id: "hace-7", createdAt: "2026-11-10T17:00:00.000Z" }),
        asset({ id: "octubre", createdAt: "2026-10-03T20:00:00.000Z" }),
        asset({ id: "otro-anio", createdAt: "2025-12-24T20:00:00.000Z" }),
      ],
      TZ,
      NOW,
    );
    expect(groups.map((g) => [g.label, g.items.map((i) => i.id)])).toEqual([
      ["Hoy", ["hoy"]],
      ["Esta semana", ["ayer", "casi-7"]],
      ["Noviembre", ["hace-7"]],
      ["Octubre", ["octubre"]],
      ["Diciembre 2025", ["otro-anio"]],
    ]);
  });

  it("la fecha corta dice la hora solo para hoy", () => {
    expect(shortDate("2026-11-17T16:42:00.000Z", TZ, NOW)).toBe("Hoy, 10:42");
    expect(shortDate("2026-09-25T18:05:00.000Z", TZ, NOW)).toBe("25 sep");
    expect(shortDate("2025-12-24T20:00:00.000Z", TZ, NOW)).toBe("24 dic 2025");
  });
});

describe("cómo se llama cada imagen", () => {
  it("se describe con la card donde está puesta antes que con la de origen", () => {
    const used = card({ id: "card-2", network: "linkedin", status: "scheduled" });
    expect(displayCard(asset({ uses: [used] }))).toBe(used);
    expect(networkLabel(asset({ uses: [used] }))).toBe("LinkedIn");
    expect(networkLabel(asset({ bornInCard: null }))).toBe("Sin card");
  });

  it("con un filtro de red o de estado, se describe con la card que lo cumple", () => {
    const instagram = card({ id: "card-ig", network: "instagram", status: "published" });
    const linkedin = card({ id: "card-li", network: "linkedin", status: "failed" });
    const inBoth = asset({ uses: [instagram, linkedin] });
    expect(displayCard(inBoth)).toBe(instagram);
    expect(displayCard(inBoth, { network: "linkedin", cardStatus: null })).toBe(linkedin);
    // Una publicación que falló cuenta como borrador, igual que en el filtro.
    expect(displayCard(inBoth, { network: null, cardStatus: "draft" })).toBe(linkedin);
    // Si ninguna cumple (no debería llegar así), se queda con la primera.
    expect(displayCard(inBoth, { network: "x", cardStatus: null })).toBe(instagram);
  });

  it("una publicación que falló cuenta como borrador; una cancelada no dice estado", () => {
    expect(statusKind("failed")).toBe("draft");
    expect(statusKind("canceled")).toBeNull();
    expect(statusKind("published")).toBe("published");
  });

  it("sin chat: lo subido directo es de Biblioteca; lo demás perdió su chat", () => {
    expect(chatLabel(asset())).toBe("Café de especialidad");
    expect(chatLabel(asset({ chat: null, origin: "uploaded", bornInCard: null }))).toBe(
      "Subida a Biblioteca",
    );
    // Subida desde una card cuyo chat se eliminó: no nació en Biblioteca.
    expect(chatLabel(asset({ chat: null, origin: "uploaded" }))).toBe("Sin chat de origen");
    expect(chatLabel(asset({ chat: null }))).toBe("Sin chat de origen");
  });

  it("el nombre es el del archivo, lo que se pidió o un genérico", () => {
    expect(assetName(asset({ originalName: "IMG_4821.jpg" }))).toBe("IMG_4821.jpg");
    expect(assetName(asset())).toBe("Taza de café sobre mesa de madera");
    expect(assetName(asset({ prompt: null, instruction: "Más cálida" }))).toBe("Más cálida");
    expect(assetName(asset({ prompt: null }))).toBe("Imagen generada");
    const long = assetName(asset({ prompt: "palabra ".repeat(20) }));
    expect(long.length).toBeLessThanOrEqual(64);
    expect(long.endsWith("…")).toBe(true);
  });
});

describe("subir", () => {
  it("rechaza por tipo y por peso con el texto de Biblioteca", () => {
    expect(libraryFileProblem({ type: "image/gif", size: 10 })).toBe(
      "Solo aceptamos JPG, PNG o WebP. Prueba con otro archivo.",
    );
    expect(libraryFileProblem({ type: "image/jpeg", size: 14 * 1024 * 1024 })).toBe(
      "El límite es 10 MB. Tu archivo pesa 14 MB. Prueba comprimirlo o sube uno más pequeño.",
    );
    expect(libraryFileProblem({ type: "image/webp", size: 1024 })).toBeNull();
  });

  it("al arrastrar solo rechaza si nada es una imagen aceptada", () => {
    expect(libraryDropVerdict(["application/pdf", "image/gif"])).toBe("type");
    expect(libraryDropVerdict(["application/pdf", "image/png"])).toBe("accept");
    // Algunos navegadores no dan tipos mientras se arrastra: se deja soltar.
    expect(libraryDropVerdict([])).toBe("accept");
  });

  it("el título del panel dice qué pasa con el lote", () => {
    expect(uploadsTitle([{ status: "uploading" }, { status: "queued" }, { status: "done" }])).toBe(
      "Subiendo 2 archivos…",
    );
    expect(uploadsTitle([{ status: "done" }])).toBe("1 archivo subido");
    expect(uploadsTitle([{ status: "done" }, { status: "done" }])).toBe("2 archivos subidos");
    expect(uploadsTitle([{ status: "done" }, { status: "error" }, { status: "done" }])).toBe(
      "3 archivos · 1 con error",
    );
  });
});

describe("detalle", () => {
  it("formato con el nombre de siempre, JPEG y no JPG", () => {
    expect(formatLabel("image/jpeg")).toBe("JPEG");
    expect(formatLabel("image/png")).toBe("PNG");
    expect(formatLabel("image/webp")).toBe("WEBP");
  });

  it("la fecha completa, con año y hora de Mérida", () => {
    expect(detailDate("2026-09-27T16:42:00.000Z", TZ)).toBe("27 sep 2026, 10:42");
  });

  it("cada versión dice su número y qué es", () => {
    const base = { assetId: "a", width: 1, height: 1, createdAt: NOW.toISOString() };
    expect(versionLabel({ ...base, kind: "original", instruction: null }, 0)).toBe("v1 · Original");
    expect(versionLabel({ ...base, kind: "edit", instruction: "Más cálida" }, 1)).toBe(
      "v2 · Más cálida",
    );
    expect(versionLabel({ ...base, kind: "edit", instruction: "  " }, 2)).toBe("v3 · Edición");
  });
});

describe("usos en varias cards (F12 PR5)", () => {
  it("'Ver card' va a donde se usa; si no se usa, a donde nació", () => {
    const otra = card({ id: "card-2", chatId: "chat-2", network: "linkedin" });
    expect(viewCardTarget(asset({ uses: [otra], state: "chosen" }))?.id).toBe("card-2");
    expect(viewCardTarget(asset())?.id).toBe("card-1");
    // Una subida suelta puesta en una card también lleva a ella.
    const suelta = asset({ chat: null, bornInCard: null, origin: "uploaded", uses: [otra] });
    expect(viewCardTarget(suelta)?.chatId).toBe("chat-2");
    // Sin chat no hay a dónde llevar.
    expect(viewCardTarget(asset({ bornInCard: card({ chatId: null }) }))).toBeNull();
  });

  it("el chip dice dónde está puesta", () => {
    expect(inUseLabel(asset({ uses: [card()], state: "chosen" }))).toBe("Elegida para su card");
    expect(inUseLabel(asset({ uses: [card({ id: "card-2" })], state: "chosen" }))).toBe("En uso");
    expect(inUseLabel(asset({ uses: [card(), card({ id: "card-2" })], state: "chosen" }))).toBe(
      "En 2 cards",
    );
    expect(inUseLabel(asset())).toBeNull();
  });
});

describe("eliminar", () => {
  const draft = (id: string) => card({ id, status: "draft" });

  it("una sin card: solo confirma, sin avisos", () => {
    const copy = deleteDialogCopy(deletePlan([asset({ originalName: "cafe-luz.png" })]));
    expect(copy).toEqual({
      kind: "confirm",
      title: "¿Eliminar esta imagen?",
      description: "Se eliminará “cafe-luz.png” de tu Biblioteca y no podrás recuperarla.",
      warnings: [],
      confirmLabel: "Eliminar imagen",
    });
  });

  it("cuenta los borradores que la pierden (una fallida también) y avisa de las publicadas", () => {
    const plan = deletePlan([
      asset({
        id: "a",
        uses: [
          draft("c1"),
          card({ id: "c2", status: "failed" }),
          card({ id: "c3", status: "published" }),
        ],
      }),
      asset({ id: "b", uses: [draft("c1")] }),
    ]);
    expect(plan.drafts).toBe(2);
    expect(plan.published).toBe(1);
    const copy = deleteDialogCopy(plan);
    expect(copy.kind === "confirm" && copy.title).toBe("¿Eliminar 2 imágenes?");
    expect(copy.kind === "confirm" && copy.warnings).toEqual([
      "2 borradores se quedarán sin imagen.",
      "La publicación en la red no cambia; en Presencia su miniatura pasa al ícono de su formato.",
    ]);
  });

  it("una programada no se ofrece: dice en qué red y qué hacer", () => {
    const copy = deleteDialogCopy(
      deletePlan([asset({ uses: [card({ status: "scheduled", network: "linkedin" })] })]),
    );
    expect(copy).toEqual({
      kind: "blocked",
      title: "No se puede eliminar esta imagen",
      description:
        "Esta imagen está en una publicación programada de LinkedIn. Cancela la programación para eliminarla.",
    });
  });

  it("en varias, las programadas se quedan y las demás se ofrecen", () => {
    const plan = deletePlan([
      asset({ id: "a" }),
      asset({ id: "b", uses: [card({ status: "scheduled" })] }),
      asset({ id: "c" }),
    ]);
    expect(plan.deletable.map((a) => a.id)).toEqual(["a", "c"]);
    const copy = deleteDialogCopy(plan);
    expect(copy.kind === "confirm" && copy.confirmLabel).toBe("Eliminar 2");
    expect(copy.kind === "confirm" && copy.warnings).toEqual([
      "1 está en una publicación programada y se queda: cancela la programación para eliminarla.",
    ]);
  });

  it("si todas están programadas, ninguna se ofrece", () => {
    const scheduled = [card({ status: "scheduled" })];
    const copy = deleteDialogCopy(
      deletePlan([asset({ id: "a", uses: scheduled }), asset({ id: "b", uses: scheduled })]),
    );
    expect(copy.kind).toBe("blocked");
    expect(copy.title).toBe("No se pueden eliminar estas imágenes");
  });

  it("el toast dice cuántas se fueron y cuántas se quedaron, y por qué", () => {
    expect(deleteResultToast({ deleted: ["a"], blocked: [] })).toEqual({
      title: "Imagen eliminada",
    });
    expect(deleteResultToast({ deleted: ["a", "b"], blocked: [] })).toEqual({
      title: "2 imágenes eliminadas",
    });
    expect(
      deleteResultToast({
        deleted: ["a"],
        blocked: [{ id: "b", reason: "scheduled", network: "instagram" }],
      }),
    ).toEqual({
      title: "Imagen eliminada",
      description: "1 se quedó: está en una publicación programada.",
    });
    expect(
      deleteResultToast({
        deleted: [],
        blocked: [
          { id: "b", reason: "editing" },
          { id: "c", reason: "editing" },
        ],
      }),
    ).toEqual({
      title: "No se eliminó ninguna imagen",
      description: "2 se quedaron: se están editando.",
    });
  });
});
