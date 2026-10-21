"use client";

import { useMemo, useState } from "react";
import { Copy, Link2 } from "lucide-react";
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
import { copyToClipboard } from "@/lib/utils";

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShareDialog({ open, onOpenChange }: ShareDialogProps) {
  const activePath = useStore((s) => s.activePath);
  const tabs = useStore((s) => s.tabs);
  const [path, setPath] = useState(activePath ?? tabs[0] ?? "");
  const [line, setLine] = useState("");
  const [copied, setCopied] = useState(false);

  // reset when dialog opens
  useMemo(() => {
    if (open) {
      setPath(activePath ?? tabs[0] ?? "");
      setLine("");
      setCopied(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const url = useMemo(() => {
    if (typeof window === "undefined") return "";
    const base = `${window.location.origin}/workspace`;
    const params = new URLSearchParams();
    if (path.trim()) params.set("file", path.trim());
    const lineNum = Number(line);
    if (Number.isFinite(lineNum) && lineNum > 0) {
      params.set("line", String(Math.floor(lineNum)));
    }
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  }, [path, line]);

  const copy = async () => {
    const ok = await copyToClipboard(url);
    if (ok) {
      setCopied(true);
      toast.success("Link copied");
      setTimeout(() => setCopied(false), 1500);
    } else {
      toast.error("Could not copy — copy manually below");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="size-4 text-primary" />
            Share a deep link
          </DialogTitle>
          <DialogDescription>
            Send this link to open the same file (and line) in RepoDeck. The
            receiver still needs their own token.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1">
            <Label htmlFor="share-path" className="text-[11px]">
              File path
            </Label>
            <Input
              id="share-path"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="src/app/page.tsx"
              spellCheck={false}
              className="font-mono text-xs"
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="share-line" className="text-[11px]">
              Line number (optional)
            </Label>
            <Input
              id="share-line"
              type="number"
              min={1}
              value={line}
              onChange={(e) => setLine(e.target.value)}
              placeholder="42"
              className="font-mono text-xs"
            />
          </div>

          <div className="rounded-md border border-border bg-muted/30 p-2">
            <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              Link
            </div>
            <div className="break-all font-mono text-[11px]">{url || "—"}</div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={copy}>
            <Copy className="size-3.5" />
            {copied ? "Copied!" : "Copy link"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
              }
