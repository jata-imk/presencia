import { Hash } from "lucide-react";

// Portado de HashtagsBlock (arquetipos.jsx).
export function Hashtags({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;
  return (
    <div className="mt-3">
      <div className="mb-1.5 flex items-center gap-1 text-[10px] font-bold tracking-wide text-fg-muted uppercase">
        <Hash size={11} />
        Hashtags · {tags.length}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <span
            key={tag}
            className="rounded-full border border-ai-border bg-ai-bg px-2.5 py-1 text-xs font-medium text-accent"
          >
            #{tag}
          </span>
        ))}
      </div>
    </div>
  );
}
