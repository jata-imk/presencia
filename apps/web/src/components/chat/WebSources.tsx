import { ArrowUpRight, ChevronDown, CircleDashed, FileText } from "lucide-react";
import { useState } from "react";
import type { WebSource } from "../../lib/web-sources.js";

// Las fuentes de una respuesta (F10.10, Chat Web.html → WSources): la
// evidencia, debajo del texto que la cita. No se funden con la línea de
// pasos: arriba el proceso, abajo de dónde salió cada dato.
//
// - Título, dominio y fecha si el buscador la trae; el fragmento solo al pasar
//   el mouse, para no repetir lo que el texto ya dice.
// - En vez de favicon, la inicial del dominio en un cuadro neutro (un ícono de
//   archivo si es un PDF): no se piden recursos a Google ni a los sitios.
// - Las citas en línea conservan el acento; la lista no lo usa.
// - Más de 3: se pliega a una fila con las iniciales de los dominios.

const COLLAPSE_FROM = 4;

const MARCAS: Record<NonNullable<WebSource["marca"]>, { label: string; title: string }> = {
  parcial: {
    label: "Leída en parte",
    title: "La página era muy larga: solo se leyó el inicio",
  },
  descripcion: {
    label: "Solo la descripción",
    title: "La página no tenía texto; solo se leyó su descripción",
  },
};

export function WebSources({ sources }: { sources: WebSource[] }) {
  const collapsible = sources.length >= COLLAPSE_FROM;
  const [open, setOpen] = useState(!collapsible);
  if (sources.length === 0) return null;

  const label = `Fuentes · ${String(sources.length)}`;
  return (
    <div className="mt-1 border-t border-line pt-3">
      {collapsible ? (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className={`inline-flex items-center gap-2 font-display text-[12.5px] font-semibold text-fg-muted transition-colors hover:text-fg-secondary ${
            open ? "" : "rounded-full border border-line py-1 pr-2.5 pl-1.5"
          }`}
        >
          {!open && (
            <span className="flex" aria-hidden="true">
              {sources.slice(0, 4).map((s, i) => (
                <span
                  key={s.url}
                  className={`flex rounded-md ring-2 ring-app ${i > 0 ? "-ml-1" : ""}`}
                >
                  <DomainTile url={s.url} dominio={s.dominio} />
                </span>
              ))}
            </span>
          )}
          <span>{label}</span>
          <ChevronDown
            size={13}
            strokeWidth={1.75}
            aria-hidden="true"
            className={`transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
      ) : (
        <p className="font-display text-[12.5px] font-semibold text-fg-muted">{label}</p>
      )}
      {open && (
        <ul className="mt-2 -ml-2 flex flex-col gap-px">
          {sources.map((s) => (
            <li key={s.url}>
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group/src flex items-start gap-2.5 rounded-lg px-2 py-1.5 no-underline transition-colors hover:bg-secondary-hover focus-visible:bg-secondary-hover"
              >
                <span className="mt-0.5 flex">
                  <DomainTile url={s.url} dominio={s.dominio} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] leading-snug font-medium text-fg max-sm:whitespace-normal">
                    {s.titulo}
                  </span>
                  <span className="mt-px flex flex-wrap gap-x-1.5 text-xs text-fg-muted">
                    <span>{s.dominio}</span>
                    {s.fecha && <span>· {s.fecha}</span>}
                    {s.marca && (
                      <span
                        title={MARCAS[s.marca].title}
                        className="inline-flex items-center gap-1"
                      >
                        · <CircleDashed size={11} strokeWidth={2} aria-hidden="true" />
                        {MARCAS[s.marca].label}
                      </span>
                    )}
                  </span>
                  {s.fragmento && (
                    <span className="mt-1 hidden text-[12.5px] leading-normal text-fg-secondary group-hover/src:block group-focus-visible/src:block">
                      {s.fragmento}
                    </span>
                  )}
                </span>
                <ArrowUpRight
                  size={14}
                  strokeWidth={1.75}
                  aria-hidden="true"
                  className="mt-0.5 shrink-0 text-fg-muted opacity-0 transition-opacity group-hover/src:opacity-100"
                />
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** La inicial del dominio en un cuadro neutro; un PDF lleva el ícono de archivo. */
function DomainTile({ url, dominio }: { url: string; dominio: string }) {
  const pdf = /\.pdf($|[?#])/i.test(url);
  return (
    <span
      aria-hidden="true"
      className="flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border border-line bg-surface font-display text-[9.5px] font-bold text-fg-secondary uppercase"
    >
      {pdf ? <FileText size={11} strokeWidth={2} /> : (dominio[0] ?? "·")}
    </span>
  );
}
