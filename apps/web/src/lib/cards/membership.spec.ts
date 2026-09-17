import { describe, expect, it } from "vitest";
import type { PublicationCardDto } from "@presencia/shared";
import {
  belongsToDrafts,
  belongsToRange,
  isNotOlder,
  sortByScheduledAt,
  type RangeQuery,
} from "./membership.js";

function card(overrides: Partial<PublicationCardDto> = {}): PublicationCardDto {
  return {
    id: "c1",
    chatId: "chat-1",
    archetype: "text_first",
    network: "x",
    status: "scheduled",
    content: {} as PublicationCardDto["content"],
    groupId: null,
    scheduledAt: "2026-09-10T15:00:00.000Z",
    publishedAt: null,
    socialAccountId: "acc-1",
    postUrl: null,
    errorMessage: null,
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

const september: RangeQuery = {
  from: new Date("2026-09-01T00:00:00.000Z"),
  to: new Date("2026-09-30T23:59:59.999Z"),
  filters: {},
};
const noChats = () => undefined;

describe("belongsToDrafts", () => {
  it("solo borradores sin fecha", () => {
    expect(belongsToDrafts(card({ status: "draft", scheduledAt: null }))).toBe(true);
    expect(belongsToDrafts(card({ status: "scheduled" }))).toBe(false);
    // Hoy toda vuelta a draft limpia scheduledAt, pero la consulta del servidor
    // exige las dos condiciones y el espejo también.
    expect(belongsToDrafts(card({ status: "draft" }))).toBe(false);
  });
});

describe("belongsToRange", () => {
  it("dentro del rango, extremos inclusivos, y fuera", () => {
    expect(belongsToRange(card(), september, noChats)).toBe(true);
    expect(
      belongsToRange(card({ scheduledAt: september.from.toISOString() }), september, noChats),
    ).toBe(true);
    expect(
      belongsToRange(card({ scheduledAt: september.to.toISOString() }), september, noChats),
    ).toBe(true);
    expect(
      belongsToRange(card({ scheduledAt: "2026-10-01T00:00:00.000Z" }), september, noChats),
    ).toBe(false);
    expect(belongsToRange(card({ scheduledAt: null }), september, noChats)).toBe(false);
  });

  it("aplica los filtros de estado y red", () => {
    const onlyScheduled = { ...september, filters: { status: ["scheduled" as const] } };
    expect(belongsToRange(card(), onlyScheduled, noChats)).toBe(true);
    // El caso que motiva todo esto: el worker la publica y con el filtro
    // "Programado" puesto tiene que salir de la grilla.
    expect(belongsToRange(card({ status: "published" }), onlyScheduled, noChats)).toBe(false);
    const onlyLinkedin = { ...september, filters: { network: ["linkedin" as const] } };
    expect(belongsToRange(card(), onlyLinkedin, noChats)).toBe(false);
  });

  it("carpeta: decide con el chat conocido, no adivina sin él, excluye huérfanas", () => {
    const inFolder = { ...september, filters: { folderId: "f1" } };
    expect(belongsToRange(card(), inFolder, () => "f1")).toBe(true);
    expect(belongsToRange(card(), inFolder, () => "f2")).toBe(false);
    expect(belongsToRange(card(), inFolder, () => null)).toBe(false);
    expect(belongsToRange(card(), inFolder, noChats)).toBe("unknown");
    expect(belongsToRange(card({ chatId: null }), inFolder, () => "f1")).toBe(false);
  });
});

describe("isNotOlder", () => {
  it("rechaza solo lo estrictamente más viejo", () => {
    const current = card({ updatedAt: "2026-09-02T00:00:00.000Z" });
    expect(isNotOlder(card({ updatedAt: "2026-09-03T00:00:00.000Z" }), current)).toBe(true);
    expect(isNotOlder(card({ updatedAt: "2026-09-02T00:00:00.000Z" }), current)).toBe(true);
    expect(isNotOlder(card({ updatedAt: "2026-09-01T00:00:00.000Z" }), current)).toBe(false);
  });
});

describe("sortByScheduledAt", () => {
  it("ordena ascendente y conserva el orden en empates", () => {
    const byId = {
      a: card({ id: "a", scheduledAt: "2026-09-10T10:00:00.000Z" }),
      b: card({ id: "b", scheduledAt: "2026-09-09T10:00:00.000Z" }),
      c: card({ id: "c", scheduledAt: "2026-09-10T10:00:00.000Z" }),
    };
    expect(sortByScheduledAt(["a", "b", "c"], byId)).toEqual(["b", "a", "c"]);
    expect(sortByScheduledAt(["c", "b", "a"], byId)).toEqual(["b", "c", "a"]);
  });
});
