"use client";

import { useCallback, useRef, useState } from "react";
import { FileUp, Loader2, Upload, X } from "lucide-react";
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
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { ingestFiles, type IngestResult } from "@/lib/upload";

interface UploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UploadDialog({ open, onOpenChange }: UploadDialogProps) {
  const addFile = useStore((s) => s.addFile);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<IngestResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setBusy(true);
      try {
        const res = await ingestFiles(files, addFile);
        setResult(res);
        if (res.added.length > 0) {
          toast.success(`Imported ${res.added.length} file(s)`, {
            description:
              res.skipped.length > 0
                ? `${res.skipped.length} skipped`
                : undefined,
          });
        } else {
          toast.error("Nothing was imported", {
            description: "All files were skipped.",
          });
        }
      } catch (err) {
        toast.error("Upload failed", {
          description: err instanceof Error ? err.message : "Unknown error",
        });
      } finally {
        setBusy(false);
      }
    },
    [addFile],
  );

  const reset = () => {
    setResult(null);
    setBusy(false);
    setDragging(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (busy) return;
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="size-4 text-primary" />
            Upload files
          </DialogTitle>
          <DialogDescription>
            Drop files, a folder, or a .zip. Text files only — binary files
            are skipped. Max 5 MB each.
          </DialogDescription>
        </DialogHeader>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            if (!busy) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (busy) return;
            const files = Array.from(e.dataTransfer.files ?? []);
            void handleFiles(files);
          }}
          className={cn(
            "flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed py-10 text-center transition-colors",
            dragging
              ? "border-primary bg-primary/5"
              : "border-border bg-muted/20",
            busy && "opacity-60",
          )}
        >
          <div className="grid size-10 place-items-center rounded-full border border-primary/25 bg-primary/10 text-primary">
            {busy ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <FileUp className="size-5" />
            )}
          </div>
          <div className="text-sm font-medium">
            {busy ? "Importing…" : "Drop files here"}
          </div>
          <div className="text-[11px] text-muted-foreground">
            or pick from your device
          </div>

          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
            >
              Choose files
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => folderInputRef.current?.click()}
              disabled={busy}
            >
              Choose folder
            </Button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              void handleFiles(files);
              e.target.value = "";
            }}
          />
          <input
            ref={folderInputRef}
            type="file"
            multiple
            // @ts-expect-error non-standard attribute widely supported
            webkitdirectory=""
            directory=""
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              void handleFiles(files);
              e.target.value = "";
            }}
          />
        </div>

        {result && (
          <div className="grid gap-2 text-xs">
            {result.added.length > 0 && (
              <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2">
                <div className="mb-1 flex items-center gap-1 font-medium text-emerald-500">
                  Added {result.added.length}
                </div>
                <ul className="max-h-24 overflow-auto scrollbar-thin">
                  {result.added.slice(0, 8).map((p) => (
                    <li key={p} className="truncate font-mono text-[11px]">
                      + {p}
                    </li>
                  ))}
                  {result.added.length > 8 && (
                    <li className="text-muted-foreground">
                      …and {result.added.length - 8} more
                    </li>
                  )}
                </ul>
              </div>
            )}
            {result.skipped.length > 0 && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2">
                <div className="mb-1 flex items-center gap-1 font-medium text-amber-500">
                  Skipped {result.skipped.length}
                </div>
                <ul className="max-h-24 overflow-auto scrollbar-thin">
                  {result.skipped.slice(0, 8).map((s) => (
                    <li key={s.path} className="truncate font-mono text-[11px]">
                      × {s.path}{" "}
                      <span className="text-muted-foreground">
                        ({s.reason})
                      </span>
                    </li>
                  ))}
                  {result.skipped.length > 8 && (
                    <li className="text-muted-foreground">
                      …and {result.skipped.length - 8} more
                    </li>
                  )}
                </ul>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => {
              if (busy) return;
              onOpenChange(false);
              reset();
            }}
            disabled={busy}
          >
            <X className="size-3.5" />
            Close
          </Button>
          {result && !busy && (
            <Button onClick={reset} variant="outline">
              Upload more
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
          }
