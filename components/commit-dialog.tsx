"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import {
  AlertTriangle,
  ChevronRight,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  GitPullRequest,
} from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useStore, type FileDraft } from "@/lib/store";
import type { GithubClient } from "@/lib/github";
import { cn } from "@/lib/utils";

const DiffEditor = dynamic(
  () => import("@monaco-editor/react").then((m) => m.DiffEditor),
  { ssr: false },
);

type Mode = "current" | "new-branch";
type Phase = "idle" | "checking" | "conflict" | "pushing";

interface CommitDialogProps {
  client: GithubClient;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STATUS_LABEL: Record<FileDraft["status"], string> = {
  added: "A",
  modified: "M",
  deleted: "D",
};

function defaultMessage(drafts: Record<string, FileDraft>): string {
  const list = Object.values(drafts);
  if (list.length === 1) {
    const d = list[0];
    if (d.status === "added") return `Add ${d.path}`;
    if (d.status === "deleted") return `Delete ${d.path}`;
    return `Update ${d.path}`;
  }
  return `Update ${list.length} files`;
}

export function CommitDialog({ client, open, onOpenChange }: CommitDialogProps) {
  const drafts = useStore((s) => s.drafts);
  const session = useStore((s) => s.session);
  const baseHeadSha = useStore((s) => s.baseHeadSha);
  const setSession = useStore((s) => s.setSession);
  const setTree = useStore((s) => s.setTree);
  const setBaseHeadSha = useStore((s) => s.setBaseHeadSha);
  const applyPush = useStore((s) => s.applyPush);

  const { resolvedTheme } = useTheme();
  const monacoTheme = resolvedTheme === "light" ? "light" : "vs-dark";

  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<Mode>("current");
  const [newBranch, setNewBranch] = useState("");
  const [prTitle, setPrTitle] = useState("");
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [latestHead, setLatestHead] = useState<string | null>(null);
  const [latestTree, setLatestTree] = useState<string | null>(null);

  const fileList = useMemo(
    () =>
      Object.values(drafts).sort((a, b) => a.path.localeCompare(b.path)),
    [drafts],
  );

  useEffect(() => {
    if (!open) return;
    setMessage(defaultMessage(drafts));
    setMode("current");
    setNewBranch(
      `repodeck/${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "")}`,
    );
    setPrTitle(defaultMessage(drafts));
    setSelectedPath(fileList[0]?.path ?? null);
    setPhase("idle");
    setLatestHead(null);
    setLatestTree(null);
  }, [open, drafts, fileList]);

  const selected = selectedPath ? drafts[selectedPath] : null;

  const checkConflict = async (): Promise<{
    ok: boolean;
    headSha: string;
    treeSha: string;
  }> => {
    if (!session) throw new Error("No session");
    setPhase("checking");
    const head = await client.getBranchHead(session.branch);
    setLatestHead(head.sha);
    setLatestTree(head.treeSha);
    if (baseHeadSha && head.sha !== baseHeadSha) {
      setPhase("conflict");
      return { ok: false, headSha: head.sha, treeSha: head.treeSha };
    }
    setPhase("idle");
    return { ok: true, headSha: head.sha, treeSha: head.treeSha };
  };

  const push = async (
    headSha: string,
    treeSha: string,
    opts: { takeRemoteFirst?: boolean } = {},
  ) => {
    if (!session) return;
    setPhase("pushing");

    try {
      if (opts.takeRemoteFirst) {
        const fresh = await client.getTree(treeSha);
        const { buildTree } = await import("@/lib/github");
        setTree(buildTree(fresh.entries), fresh.truncated);
        setBaseHeadSha(headSha);
        setPhase("idle");
        toast.success("Reloaded from remote");
        onOpenChange(false);
        return;
      }

      const blobMap: Record<string, string> = {};
      const treeEntries: Array<{
        path: string;
        mode: "100644";
        type: "blob";
        sha: string | null;
      }> = [];

      for (const draft of fileList) {
        if (draft.status === "deleted") {
          treeEntries.push({
            path: draft.path,
            mode: "100644",
            type: "blob",
            sha: null,
          });
          continue;
        }
        const sha = await client.createBlob(draft.content);
        blobMap[draft.path] = sha;
        treeEntries.push({
          path: draft.path,
          mode: "100644",
          type: "blob",
          sha,
        });
      }

      const newTree = await client.createTree(treeSha, treeEntries);
      const commit = await client.createCommit(
        message.trim() || defaultMessage(drafts),
        newTree,
        headSha,
      );

      if (mode === "current") {
        await client.updateRef(session.branch, commit.sha);
        applyPush({ newHeadSha: commit.sha, blobs: blobMap });
        toast.success("Pushed to GitHub", {
          description: `Commit ${commit.sha.slice(0, 7)}`,
          action: {
            label: "Open",
            onClick: () => window.open(commit.htmlUrl, "_blank", "noopener"),
          },
        });
      } else {
        // new branch + PR
        const branchName = newBranch.trim();
        if (!branchName) throw new Error("New branch name is required");

        await client.createRef(branchName, commit.sha);

        let prUrl: string | null = null;
        try {
          const pr = await client.createPullRequest({
            title: prTitle.trim() || message.trim() || "RepoDeck update",
            head: branchName,
            base: session.branch,
            body: message.trim(),
          });
          prUrl = pr.htmlUrl;
        } catch (err) {
          toast.warning("Commit pushed but PR could not be created", {
            description: err instanceof Error ? err.message : "Unknown error",
          });
        }

        applyPush({ newHeadSha: commit.sha, blobs: blobMap });
        setSession({ ...session, branch: branchName });

        toast.success(
          prUrl ? "Branch pushed, PR opened" : "Branch pushed",
          {
            description: prUrl
              ? `PR ready for ${branchName}`
              : `Commit ${commit.sha.slice(0, 7)}`,
            action: prUrl
              ? {
                  label: "Open PR",
                  onClick: () => window.open(prUrl!, "_blank", "noopener"),
                }
              : {
                  label: "Open commit",
                  onClick: () =>
                    window.open(commit.htmlUrl, "_blank", "noopener"),
                },
          },
        );
      }

      setPhase("idle");
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error("Push failed", { description: msg });
      setPhase("idle");
    }
  };

  const handleSubmit = async () => {
    if (!session) return;
    if (phase !== "idle") return;
    if (fileList.length === 0) {
      toast.info("No changes");
      return;
    }
    if (!message.trim()) {
      toast.error("Commit message is required");
      return;
    }
    try {
      const result = await checkConflict();
      if (result.ok) await push(result.headSha, result.treeSha);
    } catch (err) {
      toast.error("Connection failed", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
      setPhase("idle");
    }
  };

  const useRemote = async () => {
    if (!latestHead || !latestTree) return;
    setPhase("pushing");
    try {
      const fresh = await client.getTree(latestTree);
      const { buildTree } = await import("@/lib/github");
      setTree(buildTree(fresh.entries), fresh.truncated);
      setBaseHeadSha(latestHead);
      useStore.setState({ drafts: {}, remoteChanged: false });
      toast.success("Took remote version — local drafts discarded");
      onOpenChange(false);
    } catch {
      toast.error("Reload failed");
    } finally {
      setPhase("idle");
    }
  };

  const pushAnyways = () => {
    if (!latestHead || !latestTree) return;
    void push(latestHead, latestTree);
  };

  const busy = phase === "checking" || phase === "pushing";
  const label =
    phase === "checking"
      ? "Checking remote…"
      : phase === "pushing"
        ? "Pushing…"
        : mode === "current"
          ? "Commit & push"
          : "Commit, push, open PR";

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!busy) onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            Save {fileList.length} change{fileList.length === 1 ? "" : "s"}
          </DialogTitle>
          <DialogDescription>
            A single commit will be pushed to{" "}
            <span className="font-mono">{session?.branch}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-[220px_1fr]">
          {/* file list */}
          <div className="max-h-[45vh] overflow-y-auto rounded-md border border-border bg-muted/20 scrollbar-thin">
            <ul className="text-xs">
              {fileList.map((d) => (
                <li key={d.path}>
                  <button
                    type="button"
                    onClick={() => setSelectedPath(d.path)}
                    className={cn(
                      "flex w-full items-center gap-2 px-2 py-1.5 text-left font-mono",
                      selectedPath === d.path
                        ? "bg-accent text-accent-foreground"
                        : "hover:bg-accent/50",
                    )}
                  >
                    <span
                      className={cn(
                        "w-4 shrink-0 text-center font-bold",
                        d.status === "added" && "text-emerald-500",
                        d.status === "modified" && "text-amber-500",
                        d.status === "deleted" && "text-red-500",
                      )}
                    >
                      {STATUS_LABEL[d.status]}
                    </span>
                    <span className="truncate">{d.path}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* diff view */}
          <div className="min-h-[240px] min-w-0 rounded-md border border-border overflow-hidden">
            {selected ? (
              <DiffEditor
                key={selected.path}
                language="plaintext"
                original={selected.originalContent ?? ""}
                modified={selected.status === "deleted" ? "" : selected.content}
                theme={monacoTheme}
                options={{
                  readOnly: true,
                  fontSize: 12,
                  fontFamily:
                    "var(--font-jetbrains), ui-monospace, monospace",
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  renderSideBySide: false,
                  automaticLayout: true,
                }}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                Select a file to view its diff.
              </div>
            )}
          </div>
        </div>

        {/* commit message */}
        <div className="grid gap-2">
          <Label htmlFor="commit-msg">Commit message</Label>
          <Input
            id="commit-msg"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={busy}
            className="text-xs"
          />
        </div>

        {/* mode switch */}
        <div className="grid gap-2">
          <div className="flex gap-2 text-xs">
            <button
              type="button"
              onClick={() => setMode("current")}
              disabled={busy}
              className={cn(
                "flex-1 rounded-md border px-2 py-1.5 text-left",
                mode === "current"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-foreground/40",
              )}
            >
              Commit to <span className="font-mono">{session?.branch}</span>
            </button>
            <button
              type="button"
              onClick={() => setMode("new-branch")}
              disabled={busy}
              className={cn(
                "flex-1 rounded-md border px-2 py-1.5 text-left",
                mode === "new-branch"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-foreground/40",
              )}
            >
              Create branch + PR
            </button>
          </div>

          {mode === "new-branch" && (
            <div className="grid gap-2 rounded-md border border-border bg-muted/20 p-2">
              <div className="grid gap-1">
                <Label htmlFor="new-branch" className="text-[11px]">
                  New branch name
                </Label>
                <Input
                  id="new-branch"
                  value={newBranch}
                  onChange={(e) => setNewBranch(e.target.value)}
                  disabled={busy}
                  className="font-mono text-xs"
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="pr-title" className="text-[11px]">
                  Pull request title
                </Label>
                <Input
                  id="pr-title"
                  value={prTitle}
                  onChange={(e) => setPrTitle(e.target.value)}
                  disabled={busy}
                  className="text-xs"
                />
              </div>
            </div>
          )}
        </div>

        {/* conflict banner */}
        {phase === "conflict" && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
              <div className="flex-1">
                <p className="font-medium text-amber-500">
                  Remote changed since you opened this repo
                </p>
                <p className="mt-0.5 text-muted-foreground">
                  Choose how to proceed. Files you did not edit will be
                  preserved from the remote either way.
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={useRemote}
                  >
                    <RefreshCw className="size-3" />
                    Take remote
                  </Button>
                  <Button
                    size="sm"
                    variant="default"
                    className="h-7 text-xs"
                    onClick={pushAnyways}
                  >
                    <Plus className="size-3" />
                    Keep mine
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => setPhase("idle")}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Badge variant="outline" className="mr-auto text-[10px]">
            <GitPullRequest className="size-3" />
            {fileList.length} file{fileList.length === 1 ? "" : "s"}
          </Badge>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={busy}>
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <ChevronRight className="size-3.5" />
            )}
            {label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
        }
