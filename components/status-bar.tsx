"use client";

import { GitBranch, Github, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export function StatusBar() {
  const session = useStore((s) => s.session);
  const drafts = useStore((s) => s.drafts);
  const syncStatus = useStore((s) => s.syncStatus);
  const rateLimitRemaining = useStore((s) => s.rateLimitRemaining);
  const remoteChanged = useStore((s) => s.remoteChanged);

  const changeCount = Object.keys(drafts).length;

  const statusInfo = {
    synced: { color: "bg-emerald-500", label: "Synced", Icon: CheckCircle2 },
    checking: { color: "bg-amber-500", label: "Checking", Icon: Loader2 },
    error: { color: "bg-red-500", label: "Error", Icon: AlertCircle },
  }[syncStatus];

  const { Icon } = statusInfo;

  return (
    <div className="flex h-7 shrink-0 items-center gap-3 border-t border-border bg-muted/30 px-3 text-[11px] text-muted-foreground">
      <span className="flex items-center gap-1 truncate">
        <Github className="size-3 shrink-0" />
        <span className="truncate font-mono">
          {session ? `${session.owner}/${session.repo}` : "no repo"}
        </span>
      </span>

      <span className="flex items-center gap-1">
        <GitBranch className="size-3 shrink-0" />
        <span className="font-mono">{session?.branch ?? "—"}</span>
      </span>

      <span
        className={cn(
          "hidden sm:flex items-center gap-1",
          changeCount > 0 && "text-foreground",
        )}
      >
        <span className="size-1.5 rounded-full bg-amber-500" />
        {changeCount} changed
      </span>

      <span className="flex items-center gap-1">
        <span className={cn("size-1.5 rounded-full", statusInfo.color)} />
        <span className={cn(syncStatus === "checking" && "animate-pulse")}>
          {statusInfo.label}
        </span>
      </span>

      {remoteChanged && (
        <span className="hidden sm:flex items-center gap-1 text-amber-500">
          <AlertCircle className="size-3" />
          remote ahead
        </span>
      )}

      <span className="ml-auto flex items-center gap-2">
        {rateLimitRemaining !== undefined && (
          <span
            className={cn(
              rateLimitRemaining < 100 && "text-amber-500",
              rateLimitRemaining < 20 && "text-red-500",
            )}
          >
            {rateLimitRemaining} req left
          </span>
        )}
        <span className="hidden sm:inline">simulated terminal</span>
        <Icon className={cn("size-3", syncStatus === "checking" && "animate-spin")} />
      </span>
    </div>
  );
}
