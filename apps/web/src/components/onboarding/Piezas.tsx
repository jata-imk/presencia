import { Check } from "lucide-react";
import { Fragment, type ButtonHTMLAttributes, type ReactNode } from "react";

// Las piezas del onboarding (F12.5, Claude Design "Onboarding v2",
// onb2-shared.jsx). El mock trae colores de la paleta fija; aquí todo sale de
// los tokens del tema, así que el onboarding se ve bien en claro y en oscuro.
//
// Densidad: la misma escala que Configuración (pedido de Jose, F12.5): texto
// `text-sm` (13 px con su interlineado, el mismo token que los campos de
// Configuración), campos y botones de la misma altura, título y huecos un paso
// abajo del mock, que se sentía "muy grande y separado". Las alturas medidas
// están en el doc de Voz de marca §14.

export const PASOS = ["Tú", "Escribes", "Redes", "Metas", "Listo"] as const;

export function Stepper({ paso }: { paso: number }) {
  return (
    <ol
      className="mb-1 flex items-center"
      aria-label={`Paso ${String(paso + 1)} de ${String(PASOS.length)}`}
    >
      {PASOS.map((nombre, i) => {
        const activo = i === paso;
        const hecho = i < paso;
        return (
          <Fragment key={nombre}>
            <li
              className="flex flex-col items-center gap-1.25"
              aria-current={activo ? "step" : undefined}
            >
              <span
                className={`flex size-6 items-center justify-center rounded-full border-2 font-display text-[10.5px] font-semibold transition-colors duration-250 ${
                  hecho
                    ? "border-primary bg-primary text-primary-fg"
                    : activo
                      ? "border-line-focus bg-tint-plum text-brand"
                      : "border-line bg-card text-fg-muted"
                }`}
              >
                {hecho ? <Check size={11} strokeWidth={2.5} aria-hidden /> : i + 1}
              </span>
              <span
                className={`font-display text-[9.5px] tracking-wider whitespace-nowrap uppercase ${
                  activo ? "font-semibold text-brand" : "text-fg-muted"
                }`}
              >
                {nombre}
              </span>
            </li>
            {i < PASOS.length - 1 && (
              <span
                aria-hidden
                className={`mx-1.25 mb-4.25 h-0.5 flex-1 rounded-full transition-colors duration-350 ${
                  i < paso ? "bg-line-focus" : "bg-line"
                }`}
              />
            )}
          </Fragment>
        );
      })}
    </ol>
  );
}

export function Titulo({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div>
      <h1 className="mb-1 font-display text-[22px] leading-tight font-bold tracking-tight text-brand">
        {children}
      </h1>
      {sub && <p className="text-[13px] leading-normal text-pretty text-fg-secondary">{sub}</p>}
    </div>
  );
}

export function Etiqueta({
  children,
  pista,
  htmlFor,
}: {
  children: ReactNode;
  pista?: ReactNode;
  htmlFor?: string;
}) {
  const Tag = htmlFor ? "label" : "p";
  return (
    <div className="mb-1.5 flex items-baseline gap-1.5">
      <Tag
        htmlFor={htmlFor}
        className="font-display text-[11px] font-semibold tracking-wider text-fg-secondary uppercase"
      >
        {children}
      </Tag>
      {pista && <span className="text-[11.5px] text-fg-muted">{pista}</span>}
    </div>
  );
}

/** Lo que falta para seguir, centrado arriba de los botones. */
export function Pista({ children }: { children: ReactNode }) {
  return <p className="mt-3 text-center text-[11.5px] text-fg-muted">{children}</p>;
}

export function Chip({
  activo,
  children,
  ...rest
}: { activo: boolean; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      className={`rounded-full border-[1.5px] px-3 py-1.25 font-display text-[12.5px] font-medium tracking-tight transition-colors ${
        activo
          ? "border-line-focus bg-tint-plum text-brand"
          : "border-line bg-card text-fg-secondary hover:bg-secondary"
      }`}
      {...rest}
    >
      {children}
    </button>
  );
}

/** El pie con los botones, empujado al fondo de la tarjeta. */
export function Pie({ children }: { children: ReactNode }) {
  return <div className="mt-auto flex flex-wrap gap-2 pt-4">{children}</div>;
}

// Borde de 1.5 en todos (transparente en el primario): así el primario y el
// secundario miden lo mismo aunque queden en renglones distintos.
const BASE =
  "rounded-[10px] border-[1.5px] px-4 py-2 font-display text-sm transition-[transform,background-color] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100";

export function BotonPrimario({
  className = "",
  acento = false,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  /** El color de cierre (rosa): el último botón del onboarding. */
  acento?: boolean;
}) {
  const color = acento
    ? "bg-accent-cta text-accent-cta-fg hover:bg-accent-cta-hover"
    : "bg-primary text-primary-fg hover:bg-primary-hover";
  return (
    <button
      type="button"
      className={`${BASE} flex-1 border-transparent font-semibold tracking-tight ${color} ${className}`}
      {...rest}
    />
  );
}

export function BotonSecundario({
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`${BASE} shrink-0 border-line bg-card font-medium text-fg-secondary hover:bg-secondary ${className}`}
      {...rest}
    />
  );
}

/**
 * "← Atrás". En móvil (y siempre con `soloIcono`) queda la flecha sola: con
 * tres botones en el pie, la palabra empujaba "Continuar" fuera de la
 * pantalla a 375px. La palabra se queda para lectores de pantalla.
 */
export function BotonAtras({
  onClick,
  soloIcono = false,
}: {
  onClick: () => void;
  soloIcono?: boolean;
}) {
  return (
    <BotonSecundario onClick={onClick}>
      <span aria-hidden>←</span>
      <span className={soloIcono ? "sr-only" : "max-[520px]:sr-only"}> Atrás</span>
    </BotonSecundario>
  );
}

/**
 * Caja de texto del onboarding: borde de 1.5, halo de foco con el token. No
 * sale de `CAMPO_BASE` (ui/campo-estilo.ts) porque la piel es otra (fondo de
 * tarjeta, no lavanda) y mezclar las dos dejaría utilities en conflicto; la
 * medida sí es la misma (px-3 py-2, text-sm).
 */
export const CAMPO =
  "w-full rounded-[10px] border-[1.5px] border-line bg-card px-3 py-2 text-sm text-fg outline-none transition-[border-color,box-shadow] placeholder:text-fg-muted focus:border-line-focus focus:ring-3 focus:ring-focus-ring";
