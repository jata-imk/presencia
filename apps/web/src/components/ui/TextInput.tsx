import type { InputHTMLAttributes } from "react";
import { CAMPO_BASE } from "./campo-estilo.js";

export function TextInput({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${CAMPO_BASE} text-base ${className}`} {...rest} />;
}
