"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ExternalLink,
  GitCommitHorizontal,
  History as HistoryIcon,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import { GithubClient, buildTree } from "@/lib/github";
import { cn, formatRelativeTime } from "@/lib/utils";

export function HistoryPanel() {
  const session = useStore((s) => s.session);
  const activePath = useStore((s) => s.activePath);
  const setTree = useStore((s) => s.setTree);
  const setBaseHeadSha = useStore((s) => s.setBaseHeadSha);
  const [reverting, setReverting] = useState<string | null>(null);

  // Client is cheap to construct — safe to create per panel.
  const client = useMemo(() => {
    if (!session) return null;
    return new GithubClient(session.token, session.owner, session.repo);
  }, [session?.token, session?.owner, session?.repo]);

  const commitsQuery = useQuery({
    queryKey: [
      "commits",
      session?.owner,
      session?.repo,
      session?.branch,
      activePath,
    ],
    queryFn: () =>
      client!.listCommits(activePath ?? undefined, session?.branch, 20),
    enabled: Boolean(client && session),
    staleTime: 30_000,
  });

  async function handleRevert(sha: string) {
    if (!client || !session || !activePath) return;
    setReverting(sha);
    try {
      // 1. Get the blob sha for the file at that historic commit
      const blobSha = await client.getContentShaAtRef(activePath, sha);

      // 2. Revert: create a new tree containing the historic blob + a new commit
      await client.revertPathToBlob(
        session.branch,
        activePath,
        blobSha,
        `Revert ${activePath} to ${sha.slice(0, 7)}`,
      );

      // 3. Refresh local state from the new head
      const head = await client.getBranchHead(session.branch);
      const tree = await client.getTree(head.treeSha);
      setTree(buildTree(tree.entries), tree.truncated);
      setBaseHeadSha(head.sha);

      // 4. Drop the local draft and cached original so the editor refetches
      const drafts = { ...useStore.getState().drafts };
      delete drafts[activePath];
      const originals = { ...useStore.getState().originals };
      delete originals[activePath];
      useStore.setState({ drafts, originals, remoteChanged: false });

      toast.success("File reverted on GitHub", {
        description: `New commit ${head.sha.slice(0, 7)}`,
      });
      commitsQuery.refetch();
    } catch (err) {
      toast.error("Revert failed", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setReverting(null);
    }
  }

  return (
    <div className="flex h-full flex-col bg-sidebar">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5 text-xs">
        <span className="font-medium">History</span>
        {activePath && (
          <span className="max-w-[60%] truncate font-mono text-[10px] text-muted-foreground">
            {activePath}
          </span>
        )}
      </div>

      {!activePath && (
        <div className="flex flex-1 items-center justify-center px-4 text-center text-xs text-muted-foreground">
          <div>
            <HistoryIcon className="mx-auto mb-2 size-6 opacity-40" />
            <p>Open a file to see its commit history.</p>
            <p className="mt-2 text-[11px] opacity-70">
              (Repo-wide recent commits are shown below.)
            </p>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto scrollbar-thin">
        {commitsQuery.isLoading ? (
          <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Loading commits…
          </div>
        ) : commitsQuery.isError ? (
          <div className="px-3 py-4 text-center text-xs text-destructive">
            Failed to load commits.
          </div>
        ) : !commitsQuery.data || commitsQuery.data.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">
            No commits found.
          </div>
        ) : (
          <ul className="py-1">
            {commitsQuery.data.map((commit) => (
              <li key={commit.sha} className="group">
                <div className="flex items-start gap-2 px-3 py-2 hover:bg-accent/40">
                  <GitCommitHorizontal className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[10px] text-yellow-500">
                        {commit.sha.slice(0, 7)}
                      </span>
                      <span className="truncate text-[11px] font-medium">
                        {commit.message}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <span className="truncate">{commit.author}</span>
                      {commit.date && (
                        <>
                          <span>·</span>
                          <span>{formatRelativeTime(new Date(commit.date).getTime())}</span>
                        </>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <a
                        href={commit.htmlUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(
                          "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px]",
                          "text-muted-foreground hover:bg-accent hover:text-foreground",
                        )}
                      >
                        <ExternalLink className="size-2.5" />
                        GitHub
                      </a>
                      {activePath && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 gap-1 px-1.5 text-[10px]"
                          onClick={() => handleRevert(commit.sha)}
                          disabled={reverting !== null}
                        >
                          {reverting === commit.sha ? (
                            <Loader2 className="size-2.5 animate-spin" />
                          ) : (
                            <RotateCcw className="size-2.5" />
                          )}
                          Revert
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="shrink-0 border-t border-border px-2 py-1 text-[10px] text-muted-foreground">
        {commitsQuery.data?.length ?? 0} commits shown · fetches live from GitHub
      </div>
    </div>
  );
}
