import type { SocialNetwork } from "@presencia/shared";
import { Badge, type BadgeKind } from "./Badge.js";
import { NETWORK_META } from "./NetworkLogos.js";

// Portado de arquetipos.jsx. El mockup también trae una fila "Guardado ·
// Ver" (autosave + link a un panel expandido) — se omite: no hay edición
// inline de cards todavía (Editar sigue "Próximamente" en el toolbar), así
// que mostrarla sería chrome que no lleva a nada.
export function CardHeader({ network, badge }: { network: SocialNetwork; badge: BadgeKind }) {
  const meta = NETWORK_META[network];
  return (
    <div className="flex items-center gap-2.5 border-b border-line px-4 py-2.5">
      <div className="flex flex-1 items-center gap-1.5">
        <meta.Logo size={15} />
        <span className="text-[13px] font-semibold" style={{ color: meta.color }}>
          {meta.label}
        </span>
      </div>
      <Badge kind={badge} />
    </div>
  );
}
