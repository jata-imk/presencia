import { describe, expect, it } from "vitest";
import { codeLanguage } from "./CodeBlock.js";

describe("codeLanguage", () => {
  it("saca el lenguaje de la clase de react-markdown", () => {
    expect(codeLanguage("language-ts")).toBe("ts");
    expect(codeLanguage("hljs language-c++")).toBe("c++");
    expect(codeLanguage("language-c#")).toBe("c#");
  });

  it("sin lenguaje, dice Texto", () => {
    expect(codeLanguage(undefined)).toBe("Texto");
    expect(codeLanguage("")).toBe("Texto");
    expect(codeLanguage("otra-clase")).toBe("Texto");
  });
});
