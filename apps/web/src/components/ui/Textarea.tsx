import type { TextareaHTMLAttributes } from "react";
import { CAMPO_BASE } from "./campo-estilo.js";

export function Textarea({ className = "", ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`${CAMPO_BASE} min-h-16 resize-y text-sm leading-relaxed ${className}`}
      {...rest}
    />
  );
}
