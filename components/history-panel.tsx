"use client";

import { History as HistoryIcon } from "lucide-react";
import { useStore } from "@/lib/store";

export function HistoryPanel() {
  const activePath = useStore((s) => s.activePath);

  return (
    <div className="flex h-full flex-col bg-sidebar">
      <div className="border-b border-border px-3 py-1.5 text-xs font-medium">
        History
      </div>
      <div className="flex flex-1 items-center justify-center px-4 text-center text-xs text-muted-foreground">
        <div>
          <HistoryIcon className="mx-auto mb-2 size-6 opacity-40" />
          <p>Open a file to see its commit history.</p>
          {activePath && (
            <p className="mt-2 font-mono text-[11px]">{activePath}</p>
          )}
          <p className="mt-3 text-[11px] opacity-70">
            Or use the terminal: <code>git log -- {"<file>"}</code>
          </p>
        </div>
      </div>
    </div>
  );
}
