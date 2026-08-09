import type { SelectHTMLAttributes } from "react";

export function Select({
  className = "",
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`rounded-md border border-line bg-card px-3 py-2 text-sm text-fg focus:border-line-focus focus:outline-none ${className}`}
      {...rest}
    >
      {children}
    </select>
  );
}
