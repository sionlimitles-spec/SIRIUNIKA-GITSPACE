"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, Download, FileArchive, FileText, Loader2 } from "lucide-react";
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
import { useStore } from "@/lib/store";
import { flattenFiles, type GithubClient } from "@/lib/github";
import { isBinaryPath } from "@/lib/utils";
import {
  buildCombinedText,
  copyCombined,
  DEFAULT_IGNORE_PATTERNS,
  downloadText,
  downloadZip,
  estimateTokens,
  makeExportName,
  shouldIgnore,
  type ExportFile,
} from "@/lib/export";

interface ExportDialogProps {
  client: GithubClient;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface FileRow {
  path: string;
  size: number;
  ignored: boolean;
  reason?: string;
}

export function ExportDialog({ client, open, onOpenChange }: ExportDialogProps) {
  const tree = useStore((s) => s.tree);
  const drafts = useStore((s) => s.drafts);
  const originals = useStore((s) => s.originals);
  const session = useStore((s) => s.session);

  const [patterns, setPatterns] = useState(
    DEFAULT_IGNORE_PATTERNS.join(", "),
  );
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [fetchMissing, setFetchMissing] = useState(true);
  const [busy, setBusy] = useState<"copy" | "txt" | "zip" | null>(null);

  const patternList = useMemo(
    () =>
      patterns
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean),
    [patterns],
  );

  const rows: FileRow[] = useMemo(() => {
    return flattenFiles(tree).map(({ node }) => {
      if (isBinaryPath(node.path)) {
        return { path: node.path, size: 0, ignored: true, reason: "binary" };
      }
      const size =
        drafts[node.path]?.content.length ??
        originals[node.path]?.content.length ??
        node.size ??
        0;
      const ignored = shouldIgnore(node.path, size || node.size, patternList);
      return {
        path: node.path,
        size,
        ignored,
        reason: ignored ? "ignored" : undefined,
      };
    });
  }, [tree, drafts, originals, patternList]);

  useEffect(() => {
    if (!open) return;
    const next: Record<string, boolean> = {};
    for (const row of rows) {
      if (!row.ignored) next[row.path] = true;
    }
    setSelected(next);
  }, [open, rows]);

  const chosen = useMemo(
    () => rows.filter((r) => !r.ignored && selected[r.path]),
    [rows, selected],
  );

  const selectedCount = chosen.length;

  const ensureContents = async (): Promise<ExportFile[]> => {
    if (!fetchMissing) {
      const out: ExportFile[] = [];
      for (const { path } of chosen) {
        const content =
          drafts[path]?.content ?? originals[path]?.content;
        if (content !== undefined) out.push({ path, content });
      }
      return out;
    }

    const out: ExportFile[] = [];
    let i = 0;
    for (const { path } of chosen) {
      i += 1;
      const existing = drafts[path]?.content ?? originals[path]?.content;
      if (existing !== undefined) {
        out.push({ path, content: existing });
        continue;
      }
      const node = flattenFiles(tree).find((x) => x.node.path === path)?.node;
      if (!node?.sha) continue;
      try {
        const blob = await client.getBlob(node.sha);
        out.push({ path, content: blob.text });
      } catch {
        // skip files that fail
      }
      if (i % 10 === 0) {
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    return out;
  };

  const handleCopy = async () => {
    if (selectedCount === 0) {
      toast.error("No files selected");
      return;
    }
    setBusy("copy");
    try {
      const files = await ensureContents();
      const ok = await copyCombined(files);
      if (ok) {
        const text = buildCombinedText(files);
        toast.success("Copied to clipboard", {
          description: `${files.length} files · ${text.length.toLocaleString()} chars · ~${estimateTokens(text).toLocaleString()} tokens`,
        });
      } else {
        toast.error("Could not copy — browser blocked clipboard");
      }
    } finally {
      setBusy(null);
    }
  };

  const handleTxt = async () => {
    if (!session || selectedCount === 0) return;
    setBusy("txt");
    try {
      const files = await ensureContents();
      const name = makeExportName(
        session.owner,
        session.repo,
        session.branch,
        "txt",
      );
      downloadText(files, name);
      toast.success("Download started", { description: name });
    } finally {
      setBusy(null);
    }
  };

  const handleZip = async () => {
    if (!session || selectedCount === 0) return;
    setBusy("zip");
    try {
      const files = await ensureContents();
      const name = makeExportName(
        session.owner,
        session.repo,
        session.branch,
        "zip",
      );
      await downloadZip(files, name);
      toast.success("Download started", { description: name });
    } catch (err) {
      toast.error("Zip failed", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setBusy(null);
    }
  };

  const toggleAll = (value: boolean) => {
    const next: Record<string, boolean> = {};
    for (const row of rows) {
      if (!row.ignored) next[row.path] = value;
    }
    setSelected(next);
  };

  const totalChars = useMemo(() => {
    let count = 0;
    for (const row of chosen) {
      count += row.size + row.path.length + 12;
    }
    return count;
  }, [chosen]);

  const busyAny = busy !== null;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!busyAny) onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Export files</DialogTitle>
          <DialogDescription>
            Copy all selected files as one text blob, or download .txt / .zip.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1">
            <Label htmlFor="ignore-patterns" className="text-[11px]">
              Ignore patterns (comma-separated)
            </Label>
            <Input
              id="ignore-patterns"
              value={patterns}
              onChange={(e) => setPatterns(e.target.value)}
              disabled={busyAny}
              className="font-mono text-xs"
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={fetchMissing}
              onChange={(e) => setFetchMissing(e.target.checked)}
              disabled={busyAny}
              className="size-3.5 accent-emerald-500"
            />
            Fetch file contents that are not yet loaded
          </label>

          <div className="flex items-center gap-2 text-xs">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-xs"
              onClick={() => toggleAll(true)}
              disabled={busyAny}
            >
              Select all
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-xs"
              onClick={() => toggleAll(false)}
              disabled={busyAny}
            >
              Select none
            </Button>
            <span className="ml-auto text-muted-foreground">
              {selectedCount} / {rows.filter((r) => !r.ignored).length} selected
            </span>
          </div>

          <div className="max-h-[40vh] overflow-y-auto rounded-md border border-border scrollbar-thin">
            <ul className="text-xs">
              {rows.map((row) => (
                <li
                  key={row.path}
                  className="flex items-center gap-2 border-b border-border/50 px-2 py-1 last:border-0"
                >
                  <input
                    type="checkbox"
                    checked={Boolean(selected[row.path])}
                    onChange={(e) =>
                      setSelected((prev) => ({
                        ...prev,
                        [row.path]: e.target.checked,
                      }))
                    }
                    disabled={busyAny || row.ignored}
                    className="size-3.5 accent-emerald-500 disabled:opacity-40"
                  />
                  <span
                    className={
                      row.ignored
                        ? "truncate font-mono text-muted-foreground line-through"
                        : "truncate font-mono"
                    }
                  >
                    {row.path}
                  </span>
                  {row.reason && (
                    <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                      {row.reason}
                    </span>
                  )}
                  {!row.ignored && row.size > 0 && (
                    <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                      {row.size.toLocaleString()} B
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
            <span>~{totalChars.toLocaleString()} chars</span>
            <span>~{estimateTokens("x".repeat(totalChars)).toLocaleString()} tokens</span>
          </div>
        </div>

        <DialogFooter className="flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={handleCopy}
            disabled={busyAny || selectedCount === 0}
            className="gap-1"
          >
            {busy === "copy" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Copy className="size-3.5" />
            )}
            Copy
          </Button>
          <Button
            variant="outline"
            onClick={handleTxt}
            disabled={busyAny || selectedCount === 0}
            className="gap-1"
          >
            {busy === "txt" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <FileText className="size-3.5" />
            )}
            .txt
          </Button>
          <Button
            onClick={handleZip}
            disabled={busyAny || selectedCount === 0}
            className="gap-1"
          >
            {busy === "zip" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <FileArchive className="size-3.5" />
            )}
            .zip
            <Download className="size-3.5" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
