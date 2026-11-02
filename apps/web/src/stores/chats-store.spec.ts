import { beforeEach, describe, expect, it } from "vitest";
import type { ChatSummary } from "@presencia/shared";
import { useChatsStore } from "./chats-store.js";

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
    useChatsStore.getState().applyRemote(chat("b", { lastMessageId: "m-9" }));
    const state = useChatsStore.getState();
    expect(state.lastMessageIdByChat).toEqual({ b: "m-9" });
    // Las listas no ganan chats por un evento: eso lo arma GET /api/chats.
    expect(state.chats?.map((c) => c.id)).toEqual(["a"]);
  });

  it("sin lastMessageId (un renombre de antes de F11) no toca lo guardado", () => {
    useChatsStore.getState().applyRemote(chat("a", { lastMessageId: "m-2" }));
    useChatsStore.getState().applyRemote(chat("a", { title: "Otro" }));
    expect(useChatsStore.getState().lastMessageIdByChat).toEqual({ a: "m-2" });
    expect(useChatsStore.getState().chats?.[0]?.title).toBe("Otro");
  });
});
