// Indexa en la memoria entre chats (F10.8) los intercambios que todavía no
// tienen fragmento: los chats que existían antes de la memoria, o los que el
// job `memory.index` no alcanzó (falló, o el worker estaba caído).
//
// Uso:
//   pnpm --filter @presencia/api memoria:reindexar
//   pnpm --filter @presencia/api memoria:reindexar -- --modelo-nuevo
//
// --modelo-nuevo borra antes los fragmentos de OTRO modelo de embeddings: al
// cambiar AI_MODEL_EMBEDDING, los vectores viejos ya no se pueden comparar con
// las búsquedas nuevas, y la memoria se arma de nuevo con el modelo vigente.
//
// Usa la base y las keys del .env (o las variables de la shell, que ganan):
// en prod lo corre Jose, con el túnel al 5435 y las keys de prod, igual que
// las migraciones. Cuesta centavos: ~500 tokens por intercambio a $0.15/M.
import { and, eq, isNull, ne } from "drizzle-orm";
import { DEFAULT_EMBEDDING_MODEL_ID } from "../src/ai/provider-registry.js";
import { env } from "../src/env.js";

async function main(): Promise<void> {
  const { DbService } = await import("../src/db/db.service.js");
  const { AiUsageRepository } = await import("../src/ai/ai-usage.repository.js");
  const { AiUsageService } = await import("../src/ai/ai-usage.service.js");
  const { ChatRepository } = await import("../src/chat/chat.repository.js");
  const { MemoryService } = await import("../src/chat/memory.service.js");
  const { chats, memoryChunks, messages, users } = await import("../src/db/schema.js");

  const modelo = env.AI_MODEL_EMBEDDING ?? DEFAULT_EMBEDDING_MODEL_ID;
  const modeloNuevo = process.argv.includes("--modelo-nuevo");
  const dbService = new DbService();
  const repo = new ChatRepository();
  // Sin cola: el script indexa directo, de uno en uno.
  const memory = new MemoryService(
    dbService,
    repo,
    new AiUsageService(dbService, new AiUsageRepository()),
    {} as never,
  );

  const usuarios = await dbService.db.select({ id: users.id }).from(users);
  let indexados = 0;
  let fallidos = 0;
  let borrados = 0;
  for (const { id: userId } of usuarios) {
    const pendientes = await dbService.runWithTenant(userId, async (tx) => {
      if (modeloNuevo) {
        const viejos = await tx
          .delete(memoryChunks)
          .where(and(eq(memoryChunks.userId, userId), ne(memoryChunks.model, modelo)))
          .returning({ id: memoryChunks.id });
        borrados += viejos.length;
      }
      // Las respuestas (assistant) de sus chats que no tienen fragmento.
      const rows = await tx
        .select({ messageId: messages.id, chatId: messages.chatId })
        .from(messages)
        .innerJoin(chats, eq(chats.id, messages.chatId))
        .leftJoin(memoryChunks, eq(memoryChunks.messageId, messages.id))
        .where(and(eq(messages.role, "assistant"), isNull(memoryChunks.id)));
      return rows;
    });
    // Uno que falla (un 429, un timeout) no tumba el resto: se cuenta y se
    // sigue. Correr el script otra vez reintenta solo los que faltan.
    let fallaron = 0;
    for (const { messageId, chatId } of pendientes) {
      try {
        await memory.index({ userId, chatId, messageId });
        indexados++;
      } catch (error) {
        fallaron++;
        console.error(`[memoria] No se pudo indexar ${messageId}:`, error);
      }
    }
    fallidos += fallaron;
    if (pendientes.length > 0) {
      console.log(
        `[memoria] ${userId}: ${String(pendientes.length - fallaron)} intercambios indexados` +
          (fallaron > 0 ? `, ${String(fallaron)} fallaron` : ""),
      );
    }
  }
  console.log(
    `[memoria] Listo con ${modelo}: ${String(indexados)} indexados${modeloNuevo ? `, ${String(borrados)} borrados de otro modelo` : ""}.`,
  );
  if (fallidos > 0) {
    console.error(
      `[memoria] ${String(fallidos)} fallaron: corre el script otra vez para reintentarlos.`,
    );
    process.exitCode = 1;
  }
  await dbService.onModuleDestroy();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
