import { describe, expect, it } from "vitest";
import type { Message } from "grammy/types";
import { isUserContent } from "./telegram-message.js";

// Un tema implícito de iOS llega como dos updates: el aviso de servicio y el
// mensaje. Solo el segundo se contesta (prueba en vivo de F11 PR3).

const base = {
  message_id: 1,
  date: 0,
  chat: { id: 1, type: "private", first_name: "Creator" },
  from: { id: 1, is_bot: false, first_name: "Creator" },
  message_thread_id: 7,
} as const;

const msg = (extra: Record<string, unknown>) => ({ ...base, ...extra }) as unknown as Message;

describe("isUserContent", () => {
  it("lo que escribe o manda el creator se contesta", () => {
    expect(isUserContent(msg({ text: "Que puedes hacer" }))).toBe(true);
    expect(
      isUserContent(msg({ photo: [{ file_id: "x", file_unique_id: "y", width: 1, height: 1 }] })),
    ).toBe(true);
    expect(isUserContent(msg({ voice: { file_id: "x", file_unique_id: "y", duration: 3 } }))).toBe(
      true,
    );
    expect(isUserContent(msg({ sticker: { file_id: "x" } }))).toBe(true);
  });

  it("los avisos de servicio no se contestan", () => {
    expect(
      isUserContent(
        msg({
          forum_topic_created: { name: "Que puedes hacer", icon_color: 0, is_name_implicit: true },
        }),
      ),
    ).toBe(false);
    expect(isUserContent(msg({ forum_topic_edited: { name: "Otro" } }))).toBe(false);
    expect(
      isUserContent(msg({ pinned_message: { message_id: 2, date: 0, chat: base.chat } })),
    ).toBe(false);
    expect(isUserContent(msg({ write_access_allowed: {} }))).toBe(false);
  });
});
