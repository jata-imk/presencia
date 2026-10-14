import { useRef, type ClipboardEvent, type KeyboardEvent } from "react";

// El código de 6 dígitos (Auth Flow.html, "Revisa tu correo"): una caja por
// dígito, avanza solo, se puede pegar completo y Retroceso regresa a la caja
// anterior. Controlado: el valor vive en quien lo usa (recuperar.tsx), que
// decide qué hacer al completarse.

export const LARGO_DEL_CODIGO = 6;

type Tono = "neutro" | "error" | "ok";

const CAJA: Record<Tono, string> = {
  neutro: "border-line bg-card text-brand focus:border-line-focus focus:ring-focus-ring",
  error: "border-error-border bg-error-bg text-error-fg focus:ring-error-border",
  ok: "border-success-border bg-success-bg text-success-fg",
};

export function CodeInput({
  value,
  onChange,
  onComplete,
  disabled,
  tono = "neutro",
  autoFocus,
}: {
  value: string;
  onChange: (code: string) => void;
  onComplete?: (code: string) => void;
  disabled?: boolean;
  tono?: Tono;
  autoFocus?: boolean;
}) {
  const cajas = useRef<(HTMLInputElement | null)[]>([]);
  const digitos = Array.from({ length: LARGO_DEL_CODIGO }, (_, i) => value[i] ?? "");

  function poner(code: string, enfocar: number) {
    const limpio = code.replace(/\D/g, "").slice(0, LARGO_DEL_CODIGO);
    onChange(limpio);
    cajas.current[Math.min(enfocar, LARGO_DEL_CODIGO - 1)]?.focus();
    if (limpio.length === LARGO_DEL_CODIGO) onComplete?.(limpio);
  }

  function escribir(i: number, texto: string) {
    const solo = texto.replace(/\D/g, "");
    // Varios dígitos de golpe: el autollenado del sistema ("one-time-code")
    // o un teclado que pega. Se toman todos, no solo el último.
    if (solo.length > 1) {
      const code =
        solo.length >= LARGO_DEL_CODIGO ? solo.slice(-LARGO_DEL_CODIGO) : value.slice(0, i) + solo;
      poner(code, code.length);
      return;
    }
    // Uno o ninguno: vacío también llega por Supr, cortar o el teclado de
    // Android (que no manda "Backspace"), y borra el dígito.
    const nuevo = [...digitos];
    nuevo[i] = solo;
    // Sin huecos: lo escrito después de una caja vacía se recorre hacia atrás,
    // y el foco va a la primera caja vacía, no a la siguiente de la que se
    // tocó (quedaría desfasada).
    const code = nuevo.join("");
    poner(code, solo ? code.length : Math.min(i, code.length));
  }

  function tecla(i: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Backspace") return;
    e.preventDefault();
    const nuevo = [...digitos];
    if (nuevo[i]) {
      nuevo[i] = "";
      poner(nuevo.join(""), i);
    } else if (i > 0) {
      nuevo[i - 1] = "";
      poner(nuevo.join(""), i - 1);
    }
  }

  function pegar(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const texto = e.clipboardData.getData("text");
    poner(texto, texto.replace(/\D/g, "").length);
  }

  return (
    <div className="flex justify-center gap-2" role="group" aria-label="Código de 6 dígitos">
      {digitos.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            cajas.current[i] = el;
          }}
          value={d}
          onChange={(e) => escribir(i, e.currentTarget.value)}
          onKeyDown={(e) => tecla(i, e)}
          onPaste={pegar}
          onFocus={(e) => e.currentTarget.select()}
          disabled={disabled}
          autoFocus={autoFocus && i === 0}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          aria-label={`Dígito ${String(i + 1)}`}
          className={`h-12 w-10 rounded-[10px] border-[1.5px] text-center font-display text-[22px] font-bold transition-[border-color,background-color,box-shadow] outline-none focus:ring-3 disabled:cursor-not-allowed disabled:opacity-50 sm:h-13 sm:w-12 ${CAJA[tono]}`}
        />
      ))}
    </div>
  );
}
