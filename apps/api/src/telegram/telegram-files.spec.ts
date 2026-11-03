import type { Message } from "grammy/types";
import { describe, expect, it, vi } from "vitest";
import {
  TELEGRAM_DOWNLOAD_MAX_BYTES,
  TelegramFileTooBigError,
  downloadTelegramFile,
  mediaOf,
} from "./telegram-files.js";

// Qué archivo trae un mensaje de Telegram y cómo se baja (F11 PR5).

const msg = (extra: Partial<Message>) =>
  ({ message_id: 1, date: 0, chat: { id: 5, type: "private" }, ...extra }) as Message;

const TOKEN = "123:secreto-del-bot";

describe("mediaOf", () => {
  it("de una foto toma el tamaño más grande", () => {
    const media = mediaOf(
      msg({
        photo: [
          { file_id: "chica", file_unique_id: "a", width: 90, height: 90 },
          { file_id: "grande", file_unique_id: "c", width: 1280, height: 960, file_size: 200_000 },
          { file_id: "media", file_unique_id: "b", width: 320, height: 240 },
        ],
      }),
    );
    expect(media).toEqual({
      kind: "file",
      file: { fileId: "grande", fileSize: 200_000, filename: "foto.jpg", photo: true },
    });
  });

  it("un documento se revisa por nombre y tipo antes de bajarlo", () => {
    const doc = (file_name: string, mime_type?: string, file_size = 1000) =>
      mediaOf(
        msg({ document: { file_id: "d", file_unique_id: "d", file_name, mime_type, file_size } }),
      );
    expect(doc("menu.pdf", "application/pdf")).toMatchObject({
      kind: "file",
      file: { filename: "menu.pdf", photo: false },
    });
    expect(doc("notas.md", "application/octet-stream")).toMatchObject({ kind: "file" });
    expect(doc("captura.png", "image/png")).toMatchObject({ kind: "file" });
    expect(
      doc("plan.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    ).toEqual({
      kind: "rejected",
      filename: "plan.docx",
      label: "un archivo",
      reason: "unsupported",
    });
    expect(doc("IMG_0001.HEIC", "image/heic")).toMatchObject({ reason: "heic" });
    expect(doc("IMG_0002.heif")).toMatchObject({ reason: "heic" });
    expect(doc("enorme.pdf", "application/pdf", TELEGRAM_DOWNLOAD_MAX_BYTES + 1)).toMatchObject({
      reason: "too_big",
    });
  });

  it("un video (en un álbum) no se lee; texto o sticker no son archivos", () => {
    expect(
      mediaOf(
        msg({
          video: { file_id: "v", file_unique_id: "v", width: 1, height: 1, duration: 3 },
        }),
      ),
    ).toMatchObject({ kind: "rejected", reason: "unsupported" });
    expect(mediaOf(msg({ text: "hola" }))).toBeNull();
  });
});

describe("downloadTelegramFile", () => {
  const api = (file: { file_path?: string; file_size?: number }) => ({
    getFile: vi.fn(() => Promise.resolve({ file_id: "f", file_unique_id: "f", ...file })),
  });

  it("baja los bytes de la ruta que da getFile", async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(new Response(new Uint8Array([7, 8, 9]))));
    const data = await downloadTelegramFile(api({ file_path: "photos/a.jpg" }), TOKEN, "f", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect([...data]).toEqual([7, 8, 9]);
    expect(fetchImpl).toHaveBeenCalledWith(
      `https://api.telegram.org/file/bot${TOKEN}/photos/a.jpg`,
      expect.anything(),
    );
  });

  it("corta lo que pasa del tope, aunque Telegram no haya dicho el tamaño", async () => {
    const fetchImpl = () => Promise.resolve(new Response(new Uint8Array(11)));
    await expect(
      downloadTelegramFile(api({ file_path: "x" }), TOKEN, "f", {
        maxBytes: 10,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toBeInstanceOf(TelegramFileTooBigError);
    // Con el tamaño dicho, ni se baja.
    const nunca = vi.fn();
    await expect(
      downloadTelegramFile(api({ file_path: "x", file_size: 11 }), TOKEN, "f", {
        maxBytes: 10,
        fetchImpl: nunca as unknown as typeof fetch,
      }),
    ).rejects.toBeInstanceOf(TelegramFileTooBigError);
    expect(nunca).not.toHaveBeenCalled();
  });

  it("'file is too big' de getFile es el mismo aviso", async () => {
    const tooBig = {
      getFile: () =>
        Promise.reject(new Error("Call to 'getFile' failed! (400: Bad Request: file is too big)")),
    };
    await expect(downloadTelegramFile(tooBig, TOKEN, "f")).rejects.toBeInstanceOf(
      TelegramFileTooBigError,
    );
  });

  it("un error de red no lleva la URL (trae el token del bot)", async () => {
    const fetchImpl = () =>
      Promise.reject(new TypeError(`fetch failed: https://api.telegram.org/file/bot${TOKEN}/x`));
    const error = await downloadTelegramFile(api({ file_path: "x" }), TOKEN, "f", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    }).then(
      () => new Error("no lanzó"),
      (e: unknown) => e as Error,
    );
    expect(error.message).not.toContain(TOKEN);
    const notFound = () => Promise.resolve(new Response("no", { status: 404 }));
    const error404 = await downloadTelegramFile(api({ file_path: "x" }), TOKEN, "f", {
      fetchImpl: notFound as unknown as typeof fetch,
    }).then(
      () => new Error("no lanzó"),
      (e: unknown) => e as Error,
    );
    expect(error404.message).toMatch(/404/);
    expect(error404.message).not.toContain(TOKEN);
  });
});
