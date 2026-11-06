import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatSummary } from "@presencia/shared";
import { useChatsStore } from "./chats-store.js";

// Borrar un chat llama a la API y recalcula las carpetas: ambos de mentira.
vi.mock("../lib/api.js", () => ({ apiFetch: () => Promise.resolve(undefined) }));
vi.mock("./folders-store.js", () => ({
  useFoldersStore: { getState: () => ({ refresh: () => Promise.resolve() }) },
}));

// F11: el evento en vivo de un chat trae el id de su último mensaje. La
// pestaña que tiene el chat abierto lo compara con sus mensajes para saber si
// llegó un turno por otro canal (Telegram).

const chat = (id: string, extra: Partial<ChatSummary> = {}): ChatSummary => ({
  id,
  title: "Chat",
  folderId: null,
  archivedAt: null,
  pinnedAt: null,
  lastMessageAt: "2026-11-02T10:00:00.000Z",
  createdAt: "2026-11-01T10:00:00.000Z",
  channels: [],
  ...extra,
});

describe("chats-store · applyRemote y el último mensaje", () => {
  beforeEach(() => {
    useChatsStore.setState({ chats: [chat("a")], archivedChats: null, lastMessageIdByChat: {} });
  });

  it("guarda el último mensaje del chat que llega en vivo", () => {
    useChatsStore.getState().applyRemote(chat("a", { lastMessageId: "m-2" }));
    expect(useChatsStore.getState().lastMessageIdByChat).toEqual({ a: "m-2" });
  });

  it("lo guarda aunque el chat no esté en las listas (archivado abierto por URL)", () => {
    useChatsStore
      .getState()
      .applyRemote(chat("b", { lastMessageId: "m-9", archivedAt: "2026-11-01T12:00:00.000Z" }));
    const state = useChatsStore.getState();
    expect(state.lastMessageIdByChat).toEqual({ b: "m-9" });
    // Un archivado que la pestaña no conoce no entra a ninguna lista.
    expect(state.chats?.map((c) => c.id)).toEqual(["a"]);
    expect(state.archivedChats).toBeNull();
  });

  it("un chat nuevo de otro lado (un tema de Telegram) entra a Recientes en vivo", () => {
    useChatsStore
      .getState()
      .applyRemote(chat("t", { lastMessageAt: "2026-11-02T11:00:00.000Z", lastMessageId: "m-1" }));
    expect(useChatsStore.getState().chats?.map((c) => c.id)).toEqual(["t", "a"]);
    // El mismo aviso otra vez no lo duplica.
    useChatsStore.getState().applyRemote(chat("t", { lastMessageAt: "2026-11-02T11:00:00.000Z" }));
    expect(useChatsStore.getState().chats?.map((c) => c.id)).toEqual(["t", "a"]);
  });

  it("un chat que esta pestaña borró no revive por un aviso que ya venía en camino", async () => {
    useChatsStore.setState({ chats: [chat("a"), chat("borrado")] });
    await useChatsStore.getState().remove("borrado");
    useChatsStore.getState().applyRemote(chat("borrado", { title: "Título automático" }));
    expect(useChatsStore.getState().chats?.map((c) => c.id)).toEqual(["a"]);
  });

  it("con Recientes sin cargar no inventa la lista", () => {
    useChatsStore.setState({ chats: null });
    useChatsStore.getState().applyRemote(chat("t"));
    expect(useChatsStore.getState().chats).toBeNull();
  });

  it("sin lastMessageId (un renombre de antes de F11) no toca lo guardado", () => {
    useChatsStore.getState().applyRemote(chat("a", { lastMessageId: "m-2" }));
    useChatsStore.getState().applyRemote(chat("a", { title: "Otro" }));
    expect(useChatsStore.getState().lastMessageIdByChat).toEqual({ a: "m-2" });
    expect(useChatsStore.getState().chats?.[0]?.title).toBe("Otro");
  });
});
