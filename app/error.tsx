"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("Route error:", error);
  }, [error]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-6">
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        <div className="grid size-12 place-items-center rounded-full border border-destructive/30 bg-destructive/10 text-destructive">
          <AlertTriangle className="size-6" />
        </div>
        <div className="text-base font-semibold">Something went wrong</div>
        <div className="break-all text-xs text-muted-foreground">
          {error.message || "Unknown error"}
        </div>
        <Button onClick={reset} className="mt-2 gap-1">
          <RefreshCw className="size-3.5" />
          Try again
        </Button>
      </div>
    </div>
  );
}
