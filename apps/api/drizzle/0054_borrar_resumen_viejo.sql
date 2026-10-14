-- F10.8.4: la mitad "contract" de 0050 (F10.8.1). El resumen vive en `blocks`
-- desde 0050, 0053 pasó a `blocks` lo que solo vivía en `summary`, y desde
-- #167 (ya en prod) ningún código la lee ni la escribe, ni la declara el
-- schema de Drizzle. Va en un release posterior a ese, nunca en el mismo:
-- Jose migra antes de reiniciar el contenedor.
ALTER TABLE "chat_summaries" DROP COLUMN "summary";
