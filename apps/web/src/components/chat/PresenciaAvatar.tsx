// Círculo plum con el isotipo (Chat Conversation.html) — el avatar de la
// IA en la conversación.
//
// El glifo va por mask-image y no por <img> + brightness-0 invert: `invert`
// lo fuerza a blanco, y en dark mode --interactive-primary invierte a Blush
// Pop (claro), o sea glifo blanco sobre fondo claro. Con máscara toma
// currentColor y sigue el token en ambos temas — y de paso desaparece el
// estado `broken`/onError, porque un mask que no carga deja el círculo liso
// solo, sin ícono de imagen rota. Mismo mecanismo que ui/BrandMark.tsx.
export function PresenciaAvatar({ size = 28 }: { size?: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-primary text-primary-fg shadow-xs"
      style={{ width: size, height: size }}
    >
      <span
        aria-hidden="true"
        className="bg-current [mask-image:url(/assets/isotipo.png)] [mask-size:contain] [mask-position:center] [mask-repeat:no-repeat]"
        style={{ width: size * 0.55, height: size * 0.55 }}
      />
    </div>
  );
}
