import { ChevronDown } from "lucide-react";
import { useId } from "react";
import {
  NICHOS,
  PAISES,
  REGISTROS,
  TODA_LA_REPUBLICA,
  ZONAS,
  nichosAGuardar,
  type DatosOnboarding,
} from "../../lib/onboarding.js";
import { BotonPrimario, CAMPO, Chip, Etiqueta, Pie, Pista, Titulo } from "./Piezas.js";

// Paso 1 · ¿Cómo hablas? (Onboarding v2, ScreenHablas). Región y registro
// explícitos: desde F12.5 los dos cambian el system prompt, no solo un campo
// de perfil (addendum F12.5 de ADR-006).

export interface PasoProps {
  datos: DatosOnboarding;
  onCambiar: (cambio: Partial<DatosOnboarding>) => void;
}

export function PasoHablas({
  datos,
  onCambiar,
  onSiguiente,
  guardando,
  error,
}: PasoProps & { onSiguiente: () => void; guardando: boolean; error: string | null }) {
  const idCiudad = useId();
  const idPais = useId();
  const puedeSeguir = nichosAGuardar(datos).length > 0;
  const enMexico = datos.pais === "México";

  function alternarNicho(nicho: string) {
    onCambiar({
      nichos: datos.nichos.includes(nicho)
        ? datos.nichos.filter((n) => n !== nicho)
        : [...datos.nichos, nicho],
    });
  }

  return (
    <>
      <Titulo sub="Esto es lo que nos hace sonar como tú, no como robot importado.">
        ¿Cómo hablas?
      </Titulo>

      <div className="flex flex-col gap-4">
        <section>
          <Etiqueta htmlFor={idCiudad}>De dónde eres</Etiqueta>
          <div className="mb-2 flex gap-2">
            <div className="relative shrink-0">
              <label htmlFor={idPais} className="sr-only">
                País
              </label>
              <select
                id={idPais}
                value={datos.pais}
                onChange={(e) => onCambiar({ pais: e.target.value })}
                className="h-full cursor-pointer appearance-none rounded-[10px] border-[1.5px] border-line-focus bg-tint-plum py-2 pr-8 pl-3 font-display text-[13px] font-semibold text-brand outline-none focus:ring-3 focus:ring-focus-ring"
              >
                {PAISES.map((pais) => (
                  <option key={pais}>{pais}</option>
                ))}
              </select>
              <ChevronDown
                size={12}
                strokeWidth={2}
                aria-hidden
                className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-brand"
              />
            </div>
            <input
              id={idCiudad}
              type="text"
              value={datos.ciudad}
              maxLength={60}
              onChange={(e) => onCambiar({ ciudad: e.target.value })}
              placeholder="Tu estado o ciudad"
              className={`${CAMPO} min-w-0 flex-1`}
            />
          </div>
          {enMexico && (
            <div className="flex flex-wrap gap-1.75">
              {[...ZONAS, TODA_LA_REPUBLICA].map((zona) => (
                <Chip
                  key={zona}
                  activo={datos.zona === zona}
                  onClick={() => onCambiar({ zona: datos.zona === zona ? null : zona })}
                >
                  {zona}
                </Chip>
              ))}
            </div>
          )}
        </section>

        <section>
          <Etiqueta pista="elige al menos uno">De qué hablas</Etiqueta>
          <div className="flex flex-wrap gap-1.75">
            {NICHOS.map((nicho) => (
              <Chip
                key={nicho}
                activo={datos.nichos.includes(nicho)}
                onClick={() => alternarNicho(nicho)}
              >
                {nicho}
              </Chip>
            ))}
            <Chip
              activo={datos.conOtroNicho}
              onClick={() => onCambiar({ conOtroNicho: !datos.conOtroNicho })}
            >
              + Otro
            </Chip>
          </div>
          {datos.conOtroNicho && (
            <input
              // Lo acaba de pedir con "+ Otro": el foco va a donde va a escribir.
              autoFocus
              type="text"
              aria-label="Otro nicho"
              value={datos.otroNicho}
              maxLength={40}
              onChange={(e) => onCambiar({ otroNicho: e.target.value })}
              placeholder="Ej. Viajes en moto, finanzas para freelancers…"
              className={`${CAMPO} mt-2`}
            />
          )}
        </section>

        <section>
          <Etiqueta>¿Cómo le hablas a tu gente?</Etiqueta>
          <div role="radiogroup" aria-label="Registro" className="flex flex-col gap-1.5">
            {REGISTROS.map((registro) => {
              const elegido = datos.registro === registro.id;
              return (
                <button
                  key={registro.id}
                  type="button"
                  role="radio"
                  aria-checked={elegido}
                  onClick={() => onCambiar({ registro: registro.id })}
                  className={`flex items-center gap-3 rounded-[10px] border-[1.5px] px-3 py-1.75 text-left transition-colors ${
                    elegido
                      ? "border-line-focus bg-tint-plum"
                      : "border-line bg-card hover:bg-secondary"
                  }`}
                >
                  <span
                    aria-hidden
                    className={`flex size-4 shrink-0 items-center justify-center rounded-full border-2 ${
                      elegido ? "border-brand" : "border-line"
                    }`}
                  >
                    {elegido && <span className="size-1.5 rounded-full bg-brand" />}
                  </span>
                  <span className="flex min-w-0 flex-col gap-px">
                    <span
                      className={`font-display text-[13px] font-semibold ${elegido ? "text-brand" : "text-fg"}`}
                    >
                      {registro.label}
                    </span>
                    <span className="text-[11.5px] leading-snug text-fg-secondary">
                      {registro.ejemplo}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-xs text-error-fg">
          {error}
        </p>
      )}
      {!puedeSeguir && <Pista>Elige de qué hablas para continuar</Pista>}
      <Pie>
        <BotonPrimario onClick={onSiguiente} disabled={!puedeSeguir || guardando}>
          {guardando ? "Guardando…" : "Continuar →"}
        </BotonPrimario>
      </Pie>
    </>
  );
}
