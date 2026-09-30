-- F10.5 PR4: pedirle a la IA un cambio sobre una card. Se cobra por tokens,
-- como el ejemplo de voz (0037).
ALTER TYPE "public"."credit_reason" ADD VALUE 'card_rewrite' BEFORE 'refund';