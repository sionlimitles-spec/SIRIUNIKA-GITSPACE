"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { Menu, RefreshCw, Terminal as TerminalIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import { GithubClient, buildTree, toGithubError } from "@/lib/github";
import { cn } from "@/lib/utils";
import { TopBar } from "@/components/top-bar";
import { FileTree } from "@/components/file-tree";
import { Editor } from "@/components/editor";
import { StatusBar } from "@/components/status-bar";
import { Palette } from "@/components/palette";

type PaletteMode = "quick-open" | "commands" | "search-all" | null;

function TerminalPlaceholder() {
  return (
    <div className="h-full flex items-center justify-center bg-muted/20 border-t border-border">
      <div className="text-center text-xs text-muted-foreground">
        <TerminalIcon className="mx-auto mb-2 size-5 opacity-60" />
        <p className="font-mono">Simulated terminal</p>
        <p className="mt-1 opacity-70">
          Full xterm integration ships in Phase 3.
        </p>
      </div>
    </div>
  );
}

function LoadingScreen({ message }: { message: string }) {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-background">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <RefreshCw className="size-4 animate-spin" />
        {message}
      </div>
    </div>
  );
}

export function Workspace() {
  const router = useRouter();
  const session = useStore((s) => s.session);
  const hydrateSession = useStore((s) => s.hydrateSession);
  const hydrateDrafts = useStore((s) => s.hydrateDrafts);
  const setTree = useStore((s) => s.setTree);
  const setBaseHeadSha = useStore((s) => s.setBaseHeadSha);
  const setRateLimitRemaining = useStore((s) => s.setRateLimitRemaining);
  const terminalOpen = useStore((s) => s.terminalOpen);
  const toggleTerminal = useStore((s) => s.toggleTerminal);
  const remoteChanged = useStore((s) => s.remoteChanged);
  const setRemoteChanged = useStore((s) => s.setRemoteChanged);

  const [ready, setReady] = useState(false);
  const [paletteMode, setPaletteMode] = useState<PaletteMode>(null);
  const [mobileTreeOpen, setMobileTreeOpen] = useState(false);

  const client = useMemo(() => {
    if (!session) return null;
    return new GithubClient(
      session.token,
      session.owner,
      session.repo,
      setRateLimitRemaining,
    );
  }, [session, setRateLimitRemaining]);

  useEffect(() => {
    hydrateSession();
    setReady(true);
  }, [hydrateSession]);

  useEffect(() => {
    if (!ready) return;
    const current = useStore.getState().session;
    if (!current) {
      router.replace("/");
      return;
    }
    hydrateDrafts();
  }, [ready, hydrateDrafts, router, session?.branch]);

  const treeQuery = useQuery({
    queryKey: ["tree", session?.owner, session?.repo, session?.branch],
    queryFn: async () => {
      if (!client || !session) throw new Error("No client");
      const head = await client.getBranchHead(session.branch);
      const tree = await client.getTree(head.treeSha);
      return { head, tree };
    },
    enabled: Boolean(client && session),
  });

  useEffect(() => {
    if (!treeQuery.data) return;
    setTree(
      buildTree(treeQuery.data.tree.entries),
      treeQuery.data.tree.truncated,
    );
    setBaseHeadSha(treeQuery.data.head.sha);
  }, [treeQuery.data, setTree, setBaseHeadSha]);

  useEffect(() => {
    if (!treeQuery.error) return;
    toast.error("Could not load repository", {
      description: toGithubError(treeQuery.error).message,
    });
  }, [treeQuery.error]);

  // global shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === "p" && !e.shiftKey) {
        e.preventDefault();
        setPaletteMode("quick-open");
      } else if (mod && e.shiftKey && (e.key === "P" || e.code === "KeyP")) {
        e.preventDefault();
        setPaletteMode("commands");
      } else if (mod && e.shiftKey && (e.key === "F" || e.code === "KeyF")) {
        e.preventDefault();
        setPaletteMode("search-all");
      } else if (mod && e.key === "`") {
        e.preventDefault();
        toggleTerminal();
      } else if (mod && e.key.toLowerCase() === "s" && !e.shiftKey) {
        e.preventDefault();
        toast.success("Drafts saved locally", {
          description: "Use Save / Push to commit to GitHub.",
        });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggleTerminal]);

  if (!session || !client) return <LoadingScreen message="Restoring session…" />;

  const refreshing = treeQuery.isFetching && !treeQuery.data;

  return (
    <div className="h-dvh flex flex-col bg-background text-foreground overflow-hidden">
      <TopBar
        client={client}
        onOpenTree={() => setMobileTreeOpen(true)}
        onOpenPalette={(mode) => setPaletteMode(mode)}
      />

      {remoteChanged && (
        <div className="flex items-center gap-3 border-b border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs">
          <span className="font-medium text-amber-500">
            Files changed on GitHub
          </span>
          <span className="text-muted-foreground">
            Your branch has new commits since you opened it.
          </span>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto h-6 text-xs"
            onClick={() => {
              treeQuery.refetch();
              setRemoteChanged(false);
            }}
          >
            Reload
          </Button>
        </div>
      )}

      <div className="flex-1 min-h-0">
        {refreshing ? (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
            <RefreshCw className="size-4 animate-spin mr-2" />
            Loading repository tree…
          </div>
        ) : (
          <>
            {/* Desktop layout */}
            <PanelGroup
              direction="horizontal"
              className="hidden md:flex h-full"
              autoSaveId="repodeck:panels-h"
            >
              <Panel defaultSize={22} minSize={14} maxSize={40}>
                <FileTree />
              </Panel>
              <PanelResizeHandle className="w-px bg-border hover:bg-primary/60 transition-colors" />
              <Panel defaultSize={78}>
                <PanelGroup
                  direction="vertical"
                  autoSaveId="repodeck:panels-v"
                >
                  <Panel defaultSize={terminalOpen ? 70 : 100} minSize={30}>
                    <Editor client={client} />
                  </Panel>
                  {terminalOpen && (
                    <>
                      <PanelResizeHandle className="h-px bg-border hover:bg-primary/60 transition-colors" />
                      <Panel defaultSize={30} minSize={12}>
                        <TerminalPlaceholder />
                      </Panel>
                    </>
                  )}
                </PanelGroup>
              </Panel>
            </PanelGroup>

            {/* Mobile layout */}
            <div className="md:hidden h-full flex flex-col">
              <div className="flex-1 min-h-0">
                <Editor client={client} />
              </div>
              {terminalOpen && (
                <div className="h-48 shrink-0">
                  <TerminalPlaceholder />
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <StatusBar />

      {/* Mobile tree drawer */}
      {mobileTreeOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setMobileTreeOpen(false)}
          />
          <div className="absolute left-0 top-0 bottom-0 w-[82vw] max-w-sm border-r border-border bg-background shadow-2xl flex flex-col">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="text-xs font-semibold">Files</span>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={() => setMobileTreeOpen(false)}
                aria-label="Close file tree"
              >
                <Menu className="size-4" />
              </Button>
            </div>
            <div className="flex-1 min-h-0">
              <FileTree onFileOpened={() => setMobileTreeOpen(false)} />
            </div>
          </div>
        </div>
      )}

      <Palette
        mode={paletteMode}
        onClose={() => setPaletteMode(null)}
      />
    </div>
  );
}
