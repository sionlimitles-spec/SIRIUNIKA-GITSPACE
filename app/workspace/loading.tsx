import { RefreshCw } from "lucide-react";

export default function Loading() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background text-muted-foreground">
      <div className="flex flex-col items-center gap-3">
        <RefreshCw className="size-6 animate-spin text-primary" />
        <div className="text-sm">Loading workspace…</div>
        <div className="text-xs opacity-60">
          First load may take a few seconds — downloading Monaco editor.
        </div>
      </div>
    </div>
  );
}
