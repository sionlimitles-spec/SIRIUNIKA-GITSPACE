"use client";

import { useState } from "react";
import {
  FilePlus2,
  FileText,
  Keyboard,
  Search,
  Sparkles,
  Terminal,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStore } from "@/lib/store";
import { basename } from "@/lib/utils";

export function WelcomeTab() {
  const openTab = useStore((s) => s.openTab);
  const addFile = useStore((s) => s.addFile);
  const toggleTerminal = useStore((s) => s.toggleTerminal);
  const recentFiles = useStore((s) => s.recentFiles);
  const session = useStore((s) => s.session);

  const [creating, setCreating] = useState(false);
  const [newPath, setNewPath] = useState("");

  const submitNew = () => {
    const clean = newPath.trim();
    if (!clean) return;
    const ok = addFile(clean);
    if (!ok) {
      toast.error("Could not create file (invalid path or already exists)");
      return;
    }
    toast.success("File created", { description: clean });
    setNewPath("");
    setCreating(false);
    openTab(clean);
  };

  return (
    <div className="flex h-full items-center justify-center overflow-auto bg-background px-6 py-8">
      <div className="w-full max-w-xl">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-[11px] text-primary">
            <Sparkles className="size-3" />
            {session ? `${session.owner}/${session.repo}` : "RepoDeck"}
          </div>
          <h2 className="text-balance text-lg font-semibold tracking-tight">
            Ready when you are
          </h2>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
            Open a file from the tree, or pick a quick action below.
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <ActionButton
            icon={FilePlus2}
            label="New file"
            description="Create an empty file"
            onClick={() => setCreating(true)}
          />
          <ActionButton
            icon={Search}
            label="Quick open"
            description="Find a file by path"
            hint="Ctrl+P"
          />
          <ActionButton
            icon={Terminal}
            label="Toggle terminal"
            description="Simulated shell + real git/gh"
            hint="Ctrl+`"
            onClick={() => toggleTerminal()}
          />
          <ActionButton
            icon={Keyboard}
            label="Shortcuts"
            description="Ctrl+P · Ctrl+Shift+P · Ctrl+Shift+F"
          />
        </div>

        {creating && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-border bg-card p-2">
            <Input
              value={newPath}
              onChange={(e) => setNewPath(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitNew();
                if (e.key === "Escape") {
                  setCreating(false);
                  setNewPath("");
                }
              }}
              autoFocus
              placeholder="src/utils/helpers.ts"
              spellCheck={false}
              className="font-mono text-xs"
            />
            <Button size="sm" onClick={submitNew}>
              Create
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => {
                setCreating(false);
                setNewPath("");
              }}
              aria-label="Cancel"
            >
              <X className="size-3.5" />
            </Button>
          </div>
        )}

        <div className="mt-8">
          <h3 className="mb-2 px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Recent files
          </h3>
          {recentFiles.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/80 bg-card/30 px-4 py-6 text-center text-xs text-muted-foreground">
              Files you open will show up here.
            </div>
          ) : (
            <ul className="space-y-1">
              {recentFiles.slice(0, 8).map((path) => (
                <li key={path}>
                  <button
                    type="button"
                    onClick={() => openTab(path)}
                    className="flex w-full items-center gap-2 rounded-md border border-border/60 bg-card/40 px-2.5 py-1.5 text-left transition-colors hover:border-border hover:bg-card/70"
                  >
                    <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate font-mono text-[11px]">
                      {path}
                    </span>
                    <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                      {basename(path)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function ActionButton({
  icon: Icon,
  label,
  description,
  hint,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  description: string;
  hint?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-start gap-2 rounded-lg border border-border/70 bg-card/40 p-2.5 text-left transition-colors hover:border-border hover:bg-card/70"
    >
      <div className="grid size-8 shrink-0 place-items-center rounded-md border border-primary/25 bg-primary/10 text-primary">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium">{label}</span>
          {hint && (
            <kbd className="ml-auto rounded border border-border bg-background px-1 text-[9px] text-muted-foreground">
              {hint}
            </kbd>
          )}
        </div>
        <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">
          {description}
        </p>
      </div>
    </button>
  );
}
