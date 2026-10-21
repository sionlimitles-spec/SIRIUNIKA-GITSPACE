"use client";

import { ChevronRight, File, Folder } from "lucide-react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export function Breadcrumb({ path }: { path: string }) {
  const parts = path.split("/").filter(Boolean);
  const openTab = useStore((s) => s.openTab);

  if (parts.length === 0) return null;

  return (
    <div className="flex h-7 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-border bg-background px-2 text-[11px] scrollbar-thin">
      {parts.map((segment, index) => {
        const isLast = index === parts.length - 1;
        const segmentPath = parts.slice(0, index + 1).join("/");
        const Icon = isLast ? File : Folder;
        return (
          <div key={segmentPath} className="flex items-center gap-0.5">
            {index > 0 && (
              <ChevronRight className="size-3 shrink-0 text-muted-foreground/60" />
            )}
            <button
              type="button"
              onClick={() => {
                if (isLast) openTab(segmentPath);
              }}
              className={cn(
                "flex items-center gap-1 rounded px-1 py-0.5 font-mono transition-colors",
                isLast
                  ? "text-foreground"
                  : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
              )}
            >
              <Icon
                className={cn(
                  "size-3 shrink-0",
                  isLast ? "text-sky-400" : "text-muted-foreground",
                )}
              />
              <span className="truncate max-w-[160px]">{segment}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
