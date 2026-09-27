// La piel común de los campos de texto (F9.7, mock de Claude Design): relleno
// lavanda en reposo, borde de 1.5px, y al enfocar pasa a blanco con borde
// orquídea y un halo suave. Una sola constante para que TextInput, Textarea y
// Select no se desincronicen. La usan Configuración y el onboarding.
//
// Sin tamaño de texto a propósito: cada input pone el suyo. Con dos utilities
// de font-size en la misma clase gana la que Tailwind emita última, no la que
// esté después en el string.
export const CAMPO_BASE =
  "w-full rounded-md border-[1.5px] border-line bg-secondary px-3.5 py-2.5 text-fg outline-none placeholder:text-fg-muted transition-[border-color,box-shadow,background-color] focus:border-line-focus focus:bg-card focus:ring-3 focus:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-60";
