"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Command, FileText, Search, Terminal } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { useStore } from "@/lib/store";
import { flattenFiles } from "@/lib/github";
import { basename, cn } from "@/lib/utils";

type PaletteMode = "quick-open" | "commands" | "search-all" | null;

interface PaletteProps {
  mode: PaletteMode;
  onClose: () => void;
}

interface CommandItem {
  id: string;
  label: string;
  hint?: string;
  action: () => void;
}

interface FileResult {
  kind: "file";
  path: string;
}

interface SearchResult {
  kind: "match";
  path: string;
  line: number;
  text: string;
}

type Result = FileResult | SearchResult;

const SEARCH_RESULT_LIMIT = 50;
const FILE_RESULT_LIMIT = 40;

export function Palette({ mode, onClose }: PaletteProps) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const tree = useStore((s) => s.tree);
  const originals = useStore((s) => s.originals);
  const drafts = useStore((s) => s.drafts);
  const openTab = useStore((s) => s.openTab);
  const toggleTerminal = useStore((s) => s.toggleTerminal);

  useEffect(() => {
    setQuery("");
    setSelected(0);
    if (mode) {
      // focus after mount
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [mode]);

  const commands: CommandItem[] = useMemo(
    () => [
      {
        id: "toggle-terminal",
        label: "Toggle terminal",
        hint: "Ctrl+`",
        action: () => {
          toggleTerminal();
          onClose();
        },
      },
      {
        id: "quick-open",
        label: "Go to file…",
        hint: "Ctrl+P",
        action: () => {
          setQuery("");
          useStore.getState();
          // No re-entrant mode change — user can press Ctrl+P again
          onClose();
        },
      },
      {
        id: "save",
        label: "Save / Push changes",
        action: () => {
          onClose();
        },
      },
    ],
    [toggleTerminal, onClose],
  );

  const results: Result[] = useMemo(() => {
    if (!mode) return [];

    if (mode === "quick-open") {
      const q = query.trim().toLowerCase();
      const files = flattenFiles(tree);
      return files
        .filter(({ node }) => !q || node.path.toLowerCase().includes(q))
        .slice(0, FILE_RESULT_LIMIT)
        .map(({ node }) => ({ kind: "file" as const, path: node.path }));
    }

    if (mode === "search-all") {
      const q = query.trim().toLowerCase();
      if (!q) return [];
      const out: SearchResult[] = [];
      const files = flattenFiles(tree);

      for (const { node } of files) {
        if (out.length >= SEARCH_RESULT_LIMIT) break;
        const content =
          drafts[node.path]?.content ?? originals[node.path]?.content;
        if (!content) continue;
        const lines = content.split("\n");
        for (let i = 0; i < lines.length; i += 1) {
          if (lines[i].toLowerCase().includes(q)) {
            out.push({
              kind: "match",
              path: node.path,
              line: i + 1,
              text: lines[i].trim().slice(0, 140),
            });
            if (out.length >= SEARCH_RESULT_LIMIT) break;
          }
        }
      }
      return out;
    }

    return [];
  }, [mode, query, tree, originals, drafts]);

  const filteredCommands = useMemo(() => {
    if (mode !== "commands") return [];
    const q = query.trim().toLowerCase();
    return commands.filter(
      (c) => !q || c.label.toLowerCase().includes(q),
    );
  }, [mode, query, commands]);

  const activeResults: Array<Result | CommandItem> =
    mode === "commands" ? filteredCommands : results;

  useEffect(() => {
    if (!mode) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelected((i) => Math.min(i + 1, activeResults.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelected((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        selectResult();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [mode, activeResults.length, onClose]);

  function selectResult() {
    const item = activeResults[selected];
    if (!item) return;

    if (mode === "quick-open" && "kind" in item && item.kind === "file") {
      openTab(item.path);
      onClose();
    } else if (mode === "search-all" && "kind" in item && item.kind === "match") {
      openTab(item.path);
      onClose();
    } else if (mode === "commands" && "action" in item) {
      item.action();
    }
  }

  if (!mode) return null;

  const placeholder =
    mode === "quick-open"
      ? "Search files by path…"
      : mode === "commands"
        ? "Search commands…"
        : "Search across loaded files…";

  const Icon =
    mode === "quick-open" ? FileText : mode === "commands" ? Command : Search;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="top-[15%] translate-y-0 max-w-2xl gap-0 p-0"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">
          {mode === "quick-open"
            ? "Quick open"
            : mode === "commands"
              ? "Command palette"
              : "Search files"}
        </DialogTitle>

        <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
          <Icon className="size-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(0);
            }}
            placeholder={placeholder}
            spellCheck={false}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
            esc
          </kbd>
        </div>

        <div className="max-h-80 overflow-y-auto scrollbar-thin">
          {mode === "commands" ? (
            filteredCommands.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                No commands match.
              </div>
            ) : (
              <ul className="py-1">
                {filteredCommands.map((cmd, i) => (
                  <li key={cmd.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelected(i);
                        cmd.action();
                      }}
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm",
                        i === selected
                          ? "bg-accent text-accent-foreground"
                          : "hover:bg-accent/50",
                      )}
                    >
                      <Command className="size-3.5 shrink-0 opacity-70" />
                      <span className="flex-1 truncate">{cmd.label}</span>
                      {cmd.hint && (
                        <kbd className="text-[10px] text-muted-foreground">
                          {cmd.hint}
                        </kbd>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : results.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              {mode === "search-all" && !query.trim()
                ? "Type to search inside open files."
                : "No results."}
            </div>
          ) : (
            <ul className="py-1">
              {results.map((r, i) => {
                if (r.kind === "file") {
                  return (
                    <li key={r.path}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelected(i);
                          openTab(r.path);
                          onClose();
                        }}
                        className={cn(
                          "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm",
                          i === selected
                            ? "bg-accent text-accent-foreground"
                            : "hover:bg-accent/50",
                        )}
                      >
                        <FileText className="size-3.5 shrink-0 opacity-70" />
                        <span className="truncate font-mono text-xs">
                          {r.path}
                        </span>
                        <span className="ml-auto text-[10px] text-muted-foreground">
                          {basename(r.path)}
                        </span>
                      </button>
                    </li>
                  );
                }
                return (
                  <li key={`${r.path}:${r.line}`}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelected(i);
                        openTab(r.path);
                        onClose();
                      }}
                      className={cn(
                        "flex w-full flex-col items-start gap-0.5 px-3 py-1.5 text-left text-xs",
                        i === selected
                          ? "bg-accent text-accent-foreground"
                          : "hover:bg-accent/50",
                      )}
                    >
                      <div className="flex w-full items-center gap-2">
                        <FileText className="size-3 shrink-0 opacity-70" />
                        <span className="truncate font-mono">
                          {r.path}:{r.line}
                        </span>
                      </div>
                      <span className="truncate pl-5 text-muted-foreground">
                        {r.text}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-border px-3 py-1.5 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Terminal className="size-3" /> phase 2
          </span>
          <span className="ml-auto">↑↓ navigate · ↵ open · esc close</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
