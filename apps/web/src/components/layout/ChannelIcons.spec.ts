import { describe, expect, it } from "vitest";
import { channelsLabel, visibleChannels } from "./ChannelIcons.js";

describe("ChannelIcons", () => {
  it("hasta dos íconos y el resto en +N", () => {
    expect(visibleChannels([])).toEqual({ shown: [], more: 0 });
    expect(visibleChannels(["telegram"])).toEqual({ shown: ["telegram"], more: 0 });
    expect(visibleChannels(["telegram", "whatsapp", "telegram"])).toEqual({
      shown: ["telegram", "whatsapp"],
      more: 1,
    });
  });

  it("dice por dónde pasó el chat", () => {
    expect(channelsLabel(["telegram"])).toBe("Usado desde Telegram");
    expect(channelsLabel(["telegram", "whatsapp"])).toBe("Usado desde Telegram y WhatsApp");
  });
});
