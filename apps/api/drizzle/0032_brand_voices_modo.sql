-- El objetivo activo del creator: el "Modo" de la cabecera de Ritmo.
--
-- Nullable y sin default, por el mismo criterio que `brand_voices.vertical`:
-- NULL no es "sin modo", es "el usuario no lo ha elegido". Cuando viene en
-- null se DERIVA de lo que ya contestó en el paso de metas del onboarding
-- (`extras.goals`, que hasta ahora era dato muerto — se escribía una vez y no
-- lo leía nadie).
--
-- Guardarlo solo cuando lo elige a mano tiene una consecuencia concreta:
-- mejorar el diccionario de derivación sigue beneficiando a quien nunca lo
-- tocó, en vez de dejarlo congelado en la adivinanza del día que se registró.
-- Sembrar un default aquí convertiría a todos en gente que ya eligió, y la UI
-- perdería la distinción entre un valor que propusimos y uno que aceptaron.
--
-- Enum y no `text` como `vertical`: aquél es un catálogo que se va a mover, y
-- una entrada retirada tiene que poder leerse como "no elegida". Estos tres
-- valores son la decisión misma, no una taxonomía que crezca.

CREATE TYPE "public"."strategy_mode" AS ENUM('crecer', 'mantener', 'lanzar');--> statement-breakpoint
ALTER TABLE "brand_voices" ADD COLUMN "modo" "strategy_mode";
