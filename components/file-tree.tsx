"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  File,
  FilePlus2,
  Files,
  Folder,
  FolderOpen,
  FolderPlus,
  Pencil,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useStore, type FileDraft } from "@/lib/store";
import {
  flattenFiles,
  flattenVisible,
  type TreeNode,
} from "@/lib/github";
import { basename, cn, copyToClipboard } from "@/lib/utils";
import { ingestFiles } from "@/lib/upload";

const EXT_COLOR: Record<string, string> = {
  js: "text-yellow-400",
  jsx: "text-yellow-400",
  mjs: "text-yellow-400",
  cjs: "text-yellow-400",
  ts: "text-sky-400",
  tsx: "text-sky-400",
  json: "text-amber-300",
  css: "text-blue-400",
  scss: "text-pink-400",
  html: "text-orange-400",
  md: "text-sky-300",
  mdx: "text-sky-300",
  svg: "text-pink-300",
  png: "text-emerald-300",
  jpg: "text-emerald-300",
  jpeg: "text-emerald-300",
  gif: "text-emerald-300",
  webp: "text-emerald-300",
  yml: "text-purple-300",
  yaml: "text-purple-300",
  toml: "text-purple-300",
};

function FileIcon({ path }: { path: string }) {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const color = EXT_COLOR[ext] ?? "text-muted-foreground";
  return <File className={cn("size-3.5 shrink-0", color)} />;
}

interface MenuState {
  x: number;
  y: number;
  node: TreeNode;
}

type PromptState =
  | { kind: "new-file"; parent: string }
  | { kind: "new-folder"; parent: string }
  | { kind: "rename"; path: string }
  | null;

interface FileTreeProps {
  onFileOpened?: () => void;
}

export function FileTree({ onFileOpened }: FileTreeProps) {
  const tree = useStore((s) => s.tree);
  const treeLoaded = useStore((s) => s.treeLoaded);
  const expanded = useStore((s) => s.expanded);
  const drafts = useStore((s) => s.drafts);
  const activePath = useStore((s) => s.activePath);
  const toggleDir = useStore((s) => s.toggleDir);
  const openTab = useStore((s) => s.openTab);
  const addFile = useStore((s) => s.addFile);
  const addFolder = useStore((s) => s.addFolder);
  const renameFile = useStore((s) => s.renameFile);
  const deleteFile = useStore((s) => s.deleteFile);
  const duplicateFile = useStore((s) => s.duplicateFile);

  const [search, setSearch] = useState("");
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [prompt, setPrompt] = useState<PromptState>(null);
  const [promptValue, setPromptValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<TreeNode | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q) {
      return flattenFiles(tree).filter(({ node }) =>
        node.path.toLowerCase().includes(q),
      );
    }
    return flattenVisible(tree, expanded);
  }, [tree, expanded, search]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 26,
    overscan: 14,
  });

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    window.addEventListener("click", close);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", key);
    };
  }, [menu]);

  function handleRowClick(node: TreeNode) {
    if (node.type === "dir") {
      toggleDir(node.path);
    } else {
      openTab(node.path);
      onFileOpened?.();
    }
  }

  function handleContextMenu(e: React.MouseEvent, node: TreeNode) {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, node });
  }

  function openPrompt(next: PromptState) {
    if (!next) return;
    const defaultVal =
      next.kind === "rename"
        ? next.path
        : next.parent
          ? `${next.parent}/`
          : "";
    setPromptValue(defaultVal);
    setPrompt(next);
  }

  function submitPrompt() {
    if (!prompt) return;
    const value = promptValue.trim().replace(/^\/+/, "");
    if (!value) return;

    if (prompt.kind === "new-file") {
      const ok = addFile(value);
      if (!ok) {
        toast.error("Could not create file (invalid path or already exists)");
        return;
      }
      toast.success("File created", { description: value });
    } else if (prompt.kind === "new-folder") {
      const ok = addFolder(value);
      if (!ok) {
        toast.error("Could not create folder (invalid path or already exists)");
        return;
      }
      toast.success("Folder created", { description: value });
    } else if (prompt.kind === "rename") {
      const err = renameFile(prompt.path, value);
      if (err) {
        toast.error(err);
        return;
      }
      toast.success("Renamed", { description: value });
    }
    setPrompt(null);
  }

  async function copyPath(path: string) {
    const ok = await copyToClipboard(path);
    if (ok) toast.success("Path copied");
    else toast.error("Could not copy path");
  }

  async function handleDrop(files: File[]) {
    if (files.length === 0) return;
    setUploading(true);
    try {
      const res = await ingestFiles(files, addFile);
      if (res.added.length > 0) {
        toast.success(`Imported ${res.added.length} file(s)`, {
          description:
            res.skipped.length > 0
              ? `${res.skipped.length} skipped`
              : undefined,
        });
      } else {
        toast.error("Nothing imported", {
          description: `${res.skipped.length} file(s) skipped.`,
        });
      }
    } finally {
      setUploading(false);
    }
  }

  if (!treeLoaded) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        <RefreshCw className="size-3.5 mr-2 animate-spin" />
        Loading files…
      </div>
    );
  }

  if (tree.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
        <div>
          <p>This branch has no files yet.</p>
          <div className="mt-3 flex justify-center gap-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() => openPrompt({ kind: "new-file", parent: "" })}
            >
              <FilePlus2 className="size-3.5" />
              Create
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => uploadInputRef.current?.click()}
            >
              <Upload className="size-3.5" />
              Upload
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col bg-sidebar">
      <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
        <Search className="size-3.5 shrink-0 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search files…"
          spellCheck={false}
          className="flex-1 min-w-0 bg-transparent px-1 py-0.5 text-xs outline-none placeholder:text-muted-foreground"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            className="rounded p-0.5 text-muted-foreground hover:bg-accent"
            aria-label="Clear search"
          >
            <X className="size-3" />
          </button>
        )}
      </div>

      <div
        ref={scrollRef}
        className={cn(
          "relative flex-1 overflow-auto scrollbar-thin",
          dragOver && "bg-primary/5",
        )}
        onContextMenu={(e) => {
          if (e.target === e.currentTarget) {
            e.preventDefault();
            openPrompt({ kind: "new-file", parent: "" });
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!uploading) setDragOver(true);
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setDragOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (uploading) return;
          const files = Array.from(e.dataTransfer.files ?? []);
          void handleDrop(files);
        }}
      >
        {rows.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground">
            {search ? "No files match." : "Empty."}
          </div>
        ) : (
          <div
            style={{
              height: virtualizer.getTotalSize(),
              width: "100%",
              position: "relative",
            }}
          >
            {virtualizer.getVirtualItems().map((item) => {
              const { node, depth } = rows[item.index];
              const draft = drafts[node.path] as FileDraft | undefined;
              const isActive = activePath === node.path;
              const isOpen = expanded[node.path];
              const isDeleted = draft?.status === "deleted";
              const isAdded = draft?.status === "added";

              return (
                <button
                  key={node.path}
                  type="button"
                  onClick={() => handleRowClick(node)}
                  onContextMenu={(e) => handleContextMenu(e, node)}
                  className={cn(
                    "absolute left-0 right-0 flex items-center gap-1.5 px-2 text-left text-xs transition-colors",
                    "hover:bg-accent/50",
                    isActive && "bg-accent/70",
                    isDeleted && "opacity-50 line-through",
                  )}
                  style={{
                    top: item.start,
                    height: item.size,
                    paddingLeft: 8 + depth * 12,
                  }}
                >
                  {node.type === "dir" ? (
                    <>
                      {isOpen ? (
                        <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
                      )}
                      {isOpen ? (
                        <FolderOpen className="size-3.5 shrink-0 text-sky-400" />
                      ) : (
                        <Folder className="size-3.5 shrink-0 text-sky-400" />
                      )}
                    </>
                  ) : (
                    <>
                      <span className="w-3 shrink-0" />
                      <FileIcon path={node.path} />
                    </>
                  )}

                  <span className="truncate flex-1">{node.name}</span>

                  {isAdded && (
                    <span
                      className="size-1.5 shrink-0 rounded-full bg-emerald-500"
                      title="Added"
                    />
                  )}
                  {draft?.status === "modified" && (
                    <span
                      className="size-1.5 shrink-0 rounded-full bg-amber-500"
                      title="Modified"
                    />
                  )}
                </button>
              );
            })}
          </div>
        )}

        {dragOver && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-primary/10">
            <div className="rounded-lg border border-primary bg-background/95 px-3 py-2 text-xs font-medium text-primary shadow-lg">
              Drop to upload
            </div>
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1 border-t border-border bg-muted/30 px-1 py-1">
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          onClick={() => openPrompt({ kind: "new-file", parent: "" })}
          title="New file"
        >
          <FilePlus2 className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          onClick={() => openPrompt({ kind: "new-folder", parent: "" })}
          title="New folder"
        >
          <FolderPlus className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          onClick={() => uploadInputRef.current?.click()}
          title="Upload files"
          disabled={uploading}
        >
          {uploading ? (
            <RefreshCw className="size-3.5 animate-spin" />
          ) : (
            <Upload className="size-3.5" />
          )}
        </Button>
        <input
          ref={uploadInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            void handleDrop(files);
            e.target.value = "";
          }}
        />
      </div>

      {menu && (
        <div
          className="fixed z-50 w-48 rounded-md border border-border bg-popover p-1 text-xs shadow-xl"
          style={{
            left: Math.min(menu.x, window.innerWidth - 200),
            top: Math.min(menu.y, window.innerHeight - 240),
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {menu.node.type === "dir" && (
            <>
              <MenuItem
                icon={FilePlus2}
                label="New file"
                onClick={() => {
                  setMenu(null);
                  openPrompt({ kind: "new-file", parent: menu.node.path });
                }}
              />
              <MenuItem
                icon={FolderPlus}
                label="New folder"
                onClick={() => {
                  setMenu(null);
                  openPrompt({ kind: "new-folder", parent: menu.node.path });
                }}
              />
              <div className="my-1 h-px bg-border" />
            </>
          )}
          <MenuItem
            icon={Pencil}
            label="Rename"
            onClick={() => {
              setMenu(null);
              openPrompt({ kind: "rename", path: menu.node.path });
            }}
          />
          {menu.node.type === "file" && (
            <>
              <MenuItem
                icon={Files}
                label="Duplicate"
                onClick={() => {
                  const ok = duplicateFile(menu.node.path);
                  setMenu(null);
                  if (ok) toast.success("File duplicated");
                  else toast.error("Could not duplicate");
                }}
              />
              <MenuItem
                icon={Copy}
                label="Copy path"
                onClick={() => {
                  const path = menu.node.path;
                  setMenu(null);
                  void copyPath(path);
                }}
              />
            </>
          )}
          <div className="my-1 h-px bg-border" />
          <MenuItem
            icon={Trash2}
            label="Delete"
            destructive
            onClick={() => {
              setDeleteTarget(menu.node);
              setMenu(null);
            }}
          />
        </div>
      )}

      <Dialog
        open={!!prompt}
        onOpenChange={(open) => !open && setPrompt(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {prompt?.kind === "rename"
                ? "Rename"
                : prompt?.kind === "new-folder"
                  ? "New folder"
                  : "New file"}
            </DialogTitle>
            <DialogDescription>
              {prompt?.kind === "rename"
                ? "Enter the new path relative to repo root."
                : "Enter the path relative to repo root."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="path-input">Path</Label>
            <Input
              id="path-input"
              value={promptValue}
              onChange={(e) => setPromptValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitPrompt();
              }}
              autoFocus
              spellCheck={false}
              className="font-mono text-xs"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPrompt(null)}>
              Cancel
            </Button>
            <Button onClick={submitPrompt}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleteTarget?.path}?</DialogTitle>
            <DialogDescription>
              The file will be marked as deleted in your next commit.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteTarget) {
                  deleteFile(deleteTarget.path);
                  toast.success("Marked for deletion");
                }
                setDeleteTarget(null);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  destructive,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent",
        destructive && "text-destructive hover:bg-destructive/10",
      )}
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  );
}
