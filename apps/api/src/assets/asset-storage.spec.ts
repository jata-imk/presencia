import { describe, expect, it } from "vitest";
import { attachmentDisposition } from "./asset-storage.js";

describe("attachmentDisposition", () => {
  it("guarda con el nombre real (acentos incluidos) y uno ASCII de respaldo", () => {
    expect(attachmentDisposition('menú "temporada".md')).toBe(
      `attachment; filename="menu _temporada_.md"; filename*=UTF-8''men%C3%BA%20%22temporada%22.md`,
    );
  });
});
