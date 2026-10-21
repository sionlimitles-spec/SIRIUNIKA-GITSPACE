"use client";

import {
  FolderTree,
  GitBranch,
  History,
  Settings,
  Sparkles,
} from "lucide-react";
import { useStore, type ActivityView } from "@/lib/store";
import { cn } from "@/lib/utils";

const ITEMS: Array<{ id: ActivityView; icon: typeof FolderTree; label: string }> = [
  { id: "explorer", icon: FolderTree, label: "Explorer" },
  { id: "changes", icon: GitBranch, label: "Changes" },
  { id: "history", icon: History, label: "History" },
  { id: "settings", icon: Settings, label: "Settings" },
];

export function ActivityBar() {
  const view = useStore((s) => s.activityView);
  const setView = useStore((s) => s.setActivityView);
  const draftCount = useStore((s) => Object.keys(s.drafts).length);

  return (
    <div className="flex w-11 shrink-0 flex-col items-center gap-1 border-r border-border bg-sidebar py-2">
      <div className="mb-2 grid size-8 place-items-center rounded-lg border border-primary/30 bg-primary/10 text-primary">
        <Sparkles className="size-4" />
      </div>
      {ITEMS.map(({ id, icon: Icon, label }) => {
        const active = view === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => setView(id)}
            title={label}
            aria-label={label}
            aria-pressed={active}
            className={cn(
              "relative flex h-9 w-9 items-center justify-center rounded-md transition-colors",
              active
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            {id === "changes" && draftCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                {draftCount}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
