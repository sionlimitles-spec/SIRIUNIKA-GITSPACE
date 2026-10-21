"use client";

import { useMemo, useState } from "react";
import { Check, FileEdit, FilePlus2, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useStore, type FileDraft } from "@/lib/store";

const ICON: Record<FileDraft["status"], React.ComponentType<{ className?: string }>> = {
  added: FilePlus2,
  modified: FileEdit,
  deleted: Trash2,
};

const LABEL: Record<FileDraft["status"], string> = {
  added: "A",
  modified: "M",
  deleted: "D",
};

export function ChangesPanel() {
  const drafts = useStore((s) => s.drafts);
  const openTab = useStore((s) => s.openTab);
  const revertFile = useStore((s) => s.revertFile);
  const discardAll = useStore((s) => s.discardAll);
  const [confirmDiscardAll, setConfirmDiscardAll] = useState(false);

  const list = useMemo(
    () => Object.values(drafts).sort((a, b) => a.path.localeCompare(b.path)),
    [drafts],
  );

  if (list.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
        <div>
          <Check className="mx-auto mb-2 size-6 opacity-40" />
          <p>No changes yet.</p>
          <p className="mt-1 opacity-70">
            Edit a file to see it appear here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-sidebar">
      <div className="flex items-center justify-between border-b border-border px-2 py-1.5 text-xs">
        <span className="font-medium">
          {list.length} change{list.length === 1 ? "" : "s"}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 gap-1 text-[11px]"
          onClick={() => setConfirmDiscardAll(true)}
        >
          <Undo2 className="size-3" />
          Discard all
        </Button>
      </div>
      <ul className="flex-1 overflow-auto py-1 scrollbar-thin">
        {list.map((d) => {
          const Icon = ICON[d.status];
          return (
            <li key={d.path}>
              <div className="group flex items-center gap-2 px-2 py-1 text-xs hover:bg-accent/40">
                <span
                  className={
                    d.status === "added"
                      ? "text-emerald-500"
                      : d.status === "deleted"
                        ? "text-red-500"
                        : "text-amber-500"
                  }
                >
                  {LABEL[d.status]}
                </span>
                <Icon
                  className={`size-3.5 shrink-0 ${
                    d.status === "deleted"
                      ? "text-red-500"
                      : d.status === "added"
                        ? "text-emerald-500"
                        : "text-amber-500"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => {
                    if (d.status !== "deleted") openTab(d.path);
                  }}
                  className="truncate flex-1 text-left font-mono text-[11px]"
                  title={d.path}
                >
                  {d.path}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    revertFile(d.path);
                    toast.success(`Discarded ${d.path}`);
                  }}
                  title="Discard changes"
                  className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                >
                  <Undo2 className="size-3" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <Dialog open={confirmDiscardAll} onOpenChange={setConfirmDiscardAll}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Discard all changes?</DialogTitle>
            <DialogDescription>
              All drafts will be reverted to the last synced state. This cannot
              be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setConfirmDiscardAll(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                discardAll();
                setConfirmDiscardAll(false);
                toast.success("All changes discarded");
              }}
            >
              Discard all
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
