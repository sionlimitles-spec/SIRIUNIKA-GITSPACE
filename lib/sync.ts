"use client";

import { useEffect, useRef } from "react";
import type { GithubClient } from "@/lib/github";
import { useStore } from "@/lib/store";

const INTERVAL_KEY = "repodeck:poll-interval";
const DEFAULT_INTERVAL = 12_000; // dinaikkan dari 8s → hemat 33%
const MIN_INTERVAL = 8_000;
const MAX_INTERVAL = 60_000;
const MIN_REMAINING = 100; // pause polling kalau sisa < 100

export function getPollInterval(): number {
  if (typeof window === "undefined") return DEFAULT_INTERVAL;
  const raw = window.localStorage.getItem(INTERVAL_KEY);
  const parsed = raw ? Number(raw) : NaN;
  if (!Number.isFinite(parsed)) return DEFAULT_INTERVAL;
  return Math.min(MAX_INTERVAL, Math.max(MIN_INTERVAL, parsed));
}

export function setPollInterval(ms: number): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    INTERVAL_KEY,
    String(Math.min(MAX_INTERVAL, Math.max(MIN_INTERVAL, ms))),
  );
}

export function useSyncPolling(
  client: GithubClient | null,
  branch: string | undefined,
  enabled: boolean,
): void {
  const etagRef = useRef<string | undefined>(undefined);
  const timerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!client || !branch || !enabled) return;

    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      if (
        typeof document !== "undefined" &&
        document.visibilityState !== "visible"
      ) {
        return;
      }

      const store = useStore.getState();

      // Skip kalau rate limit menipis — yang penting UI nggak error
      if (
        store.rateLimitRemaining !== undefined &&
        store.rateLimitRemaining < MIN_REMAINING
      ) {
        return;
      }

      store.setSyncStatus("checking");

      try {
        const result = await client.pollBranch(branch, etagRef.current);
        if (cancelled) return;
        if (!result.notModified) {
          etagRef.current = result.etag || undefined;
          const base = useStore.getState().baseHeadSha;
          if (result.sha && base && result.sha !== base) {
            useStore.getState().setRemoteChanged(true);
          }
        }
        useStore.getState().setSyncStatus("synced");
      } catch {
        if (!cancelled) useStore.getState().setSyncStatus("error");
      }
    };

    tick();

    const interval = getPollInterval();
    timerRef.current = window.setInterval(tick, interval);

    return () => {
      cancelled = true;
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [client, branch, enabled]);
}
