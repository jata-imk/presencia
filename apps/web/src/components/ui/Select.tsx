import type { SelectHTMLAttributes } from "react";
import { CAMPO_BASE } from "./campo-estilo.js";

export function Select({
  className = "",
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`${CAMPO_BASE} cursor-pointer ${className}`} {...rest}>
      {children}
    </select>
  );
}
