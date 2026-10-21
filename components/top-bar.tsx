"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  Copy,
  Download,
  Layers,
  Link2,
  Menu,
  Moon,
  Save,
  Sun,
  Terminal as TerminalIcon,
  Upload,
} from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useStore } from "@/lib/store";
import type { GithubClient } from "@/lib/github";
import { CommitDialog } from "@/components/commit-dialog";
import { ExportDialog } from "@/components/export-dialog";
import { UploadDialog } from "@/components/upload-dialog";
import { ShareDialog } from "@/components/share-dialog";

type PaletteMode = "quick-open" | "commands" | "search-all";

interface TopBarProps {
  client: GithubClient;
  onOpenSidebar: () => void;
  onOpenPalette: (mode: PaletteMode) => void;
}

export function TopBar({
  client,
  onOpenSidebar,
  onOpenPalette,
}: TopBarProps) {
  const session = useStore((s) => s.session);
  const setSession = useStore((s) => s.setSession);
  const drafts = useStore((s) => s.drafts);
  const terminalOpen = useStore((s) => s.terminalOpen);
  const toggleTerminal = useStore((s) => s.toggleTerminal);

  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme !== "light";

  const [branches, setBranches] = useState<string[]>([]);
  const [commitOpen, setCommitOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const changeCount = Object.keys(drafts).length;

  useEffect(() => {
    let cancelled = false;
    client
      .listBranches()
      .then((list) => {
        if (!cancelled) setBranches(list);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [client]);

  function switchBranch(next: string) {
    const state = useStore.getState();
    if (!state.session || next === state.session.branch) return;
    if (Object.keys(state.drafts).length > 0) {
      toast.error("Save / Push your changes before switching branches.");
      return;
    }
    setSession({ ...state.session, branch: next });
    useStore.setState({
      drafts: {},
      originals: {},
      tabs: [],
      activePath: null,
      baseHeadSha: null,
      tree: [],
      treeLoaded: false,
      hydrated: false,
      hydratedFor: null,
      remoteChanged: false,
    });
    toast.success(`Switched to ${next}`);
  }

  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border bg-background px-2">
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden size-8"
        onClick={onOpenSidebar}
        aria-label="Open sidebar"
      >
        <Menu className="size-4" />
      </Button>

      <Link
        href="/"
        className="flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs font-semibold tracking-tight hover:bg-accent/50"
      >
        <span className="grid size-6 place-items-center rounded-md border border-primary/30 bg-primary/10 text-primary">
          <Layers className="size-3.5" />
        </span>
        <span className="hidden sm:inline">
          Repo<span className="text-primary">Deck</span>
        </span>
      </Link>

      <div className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground">
        <span className="font-mono">
          {session ? `${session.owner}/${session.repo}` : ""}
        </span>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 gap-1 text-xs">
            {session?.branch ?? "main"}
            <ChevronDown className="size-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-80 overflow-auto">
          {branches.length === 0 && (
            <DropdownMenuItem disabled>No branches</DropdownMenuItem>
          )}
          {branches.map((b) => (
            <DropdownMenuItem
              key={b}
              onClick={() => switchBranch(b)}
              className="font-mono text-xs"
            >
              {b}
              {b === session?.branch && (
                <Badge variant="secondary" className="ml-auto text-[10px]">
                  current
                </Badge>
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => onOpenPalette("quick-open")}>
            Quick open <kbd className="ml-auto text-[10px]">Ctrl+P</kbd>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onOpenPalette("commands")}>
            Commands <kbd className="ml-auto text-[10px]">Ctrl+Shift+P</kbd>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="ml-auto flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={() => setUploadOpen(true)}
          title="Upload files"
        >
          <Upload className="size-3.5" />
          <span className="hidden lg:inline">Upload</span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={() => setExportOpen(true)}
          title="Copy or download all files"
        >
          <Copy className="size-3.5" />
          <span className="hidden lg:inline">Copy</span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={() => setExportOpen(true)}
          title="Download all files"
        >
          <Download className="size-3.5" />
          <span className="hidden xl:inline">Download</span>
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={() => setShareOpen(true)}
          title="Share a deep link"
        >
          <Link2 className="size-3.5" />
        </Button>

        <Button
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={() => {
            if (changeCount === 0) {
              toast.info("No changes to push");
              return;
            }
            setCommitOpen(true);
          }}
          disabled={changeCount === 0}
        >
          <Save className="size-3.5" />
          <span className="hidden sm:inline">Save / Push</span>
          <span className="sm:hidden">Save</span>
          {changeCount > 0 && (
            <Badge
              variant="secondary"
              className="ml-1 h-4 min-w-4 justify-center px-1 text-[10px]"
            >
              {changeCount}
            </Badge>
          )}
        </Button>

        <Button
          variant={terminalOpen ? "secondary" : "ghost"}
          size="icon"
          className="size-7"
          onClick={toggleTerminal}
          title="Toggle terminal (Ctrl+`)"
        >
          <TerminalIcon className="size-3.5" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={() => setTheme(isDark ? "light" : "dark")}
          title={isDark ? "Switch to light theme" : "Switch to dark theme"}
        >
          {isDark ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
        </Button>
      </div>

      <CommitDialog
        client={client}
        open={commitOpen}
        onOpenChange={setCommitOpen}
      />
      <ExportDialog
        client={client}
        open={exportOpen}
        onOpenChange={setExportOpen}
      />
      <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} />
      <ShareDialog open={shareOpen} onOpenChange={setShareOpen} />
    </div>
  );
}
