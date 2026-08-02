import type { TextareaHTMLAttributes } from "react";

export function Textarea({ className = "", ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`rounded-md border border-line bg-card px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus:border-line-focus focus:outline-none ${className}`}
      {...rest}
    />
  );
}
