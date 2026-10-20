"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "motion/react";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Eye,
  EyeOff,
  Github,
  Layers,
  Loader2,
  Lock,
  Moon,
  Plug,
  Star,
  Sun,
  Trash2,
} from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { GithubClient, type BranchHead, type RepoMeta, toGithubError } from "@/lib/github";
import { useStore } from "@/lib/store";
import {
  addRecentRepo,
  formatRelativeTime,
  parseRepo,
  readRecentRepos,
  removeRecentRepo,
  sessionSchema,
  type RecentRepo,
  type RepoSession,
} from "@/lib/utils";

interface TestResult {
  meta: RepoMeta;
  head: BranchHead;
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2">
      <span className="grid size-8 place-items-center rounded-lg border border-primary/30 bg-primary/10 text-primary">
        <Layers className="size-4" />
      </span>
      <span className="text-sm font-semibold tracking-tight">
        Repo<span className="text-primary">Deck</span>
      </span>
    </Link>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = resolvedTheme !== "light";
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Toggle theme"
      disabled={!mounted}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}

export function Home() {
  const router = useRouter();
  const setSession = useStore((s) => s.setSession);
  const existingSession = useStore((s) => s.session);
  const hydrateSession = useStore((s) => s.hydrateSession);

  const [token, setToken] = useState("");
  const [repoInput, setRepoInput] = useState("");
  const [branch, setBranch] = useState("main");
  const [remember, setRemember] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [opening, setOpening] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [recent, setRecent] = useState<RecentRepo[]>([]);

  useEffect(() => {
    hydrateSession();
  }, [hydrateSession]);

  useEffect(() => {
    setRecent(readRecentRepos());
  }, []);

  useEffect(() => {
    if (!existingSession) return;
    setToken(existingSession.token);
    setRepoInput(`${existingSession.owner}/${existingSession.repo}`);
    setBranch(existingSession.branch);
    setRemember(existingSession.remember);
  }, [existingSession]);

  const parsed = useMemo(
    () =>
      sessionSchema.safeParse({
        token,
        repo: repoInput,
        branch: branch || "main",
        remember,
      }),
    [token, repoInput, branch, remember],
  );

  const validate = () => {
    const result = sessionSchema.safeParse({
      token,
      repo: repoInput,
      branch: branch || "main",
      remember,
    });
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? "Check your inputs.");
      return null;
    }
    setError(null);
    return result.data;
  };

  const connect = async (
    input: NonNullable<ReturnType<typeof validate>>,
  ): Promise<TestResult> => {
    const repo = parseRepo(input.repo);
    if (!repo) throw new Error("Invalid repo");
    const client = new GithubClient(input.token, repo.owner, repo.repo);
    const [meta, head] = await Promise.all([
      client.getRepo(),
      client.getBranchHead(input.branch),
    ]);
    return { meta, head };
  };

  const handleTest = async () => {
    const data = validate();
    if (!data) return;
    setTesting(true);
    setTestResult(null);
    try {
      const result = await connect(data);
      setTestResult(result);
      toast.success("Connection successful", {
        description: `Connected to ${result.meta.fullName}.`,
      });
    } catch (err) {
      const ghErr = toGithubError(err);
      setError(ghErr.message);
      toast.error("Connection failed", { description: ghErr.message });
    } finally {
      setTesting(false);
    }
  };

  const handleOpen = async () => {
    const data = validate();
    if (!data) return;
    setOpening(true);
    try {
      await connect(data);
      const repo = parseRepo(data.repo);
      if (!repo) throw new Error("Invalid repo");

      const session: RepoSession = {
        token: data.token,
        owner: repo.owner,
        repo: repo.repo,
        branch: data.branch,
        remember: data.remember,
      };
      setSession(session);
      setRecent(
        addRecentRepo({
          owner: repo.owner,
          repo: repo.repo,
          branch: data.branch,
          openedAt: Date.now(),
        }),
      );
      toast.success("Workspace ready");
      router.push("/workspace");
    } catch (err) {
      const ghErr = toGithubError(err);
      setError(ghErr.message);
      toast.error("Could not open workspace", { description: ghErr.message });
    } finally {
      setOpening(false);
    }
  };

  const pickRecent = (item: RecentRepo) => {
    setRepoInput(`${item.owner}/${item.repo}`);
    setBranch(item.branch);
    setError(null);
    setTestResult(null);
  };

  const dropRecent = (item: RecentRepo) => {
    setRecent(removeRecentRepo(item.owner, item.repo));
  };

  const busy = testing || opening;

  return (
    <div className="relative min-h-dvh overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 -top-40 size-[36rem] rounded-full bg-emerald-500/15 blur-[120px]" />
        <div className="absolute -right-32 top-1/3 size-[30rem] rounded-full bg-sky-500/10 blur-[120px]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_72%)]" />
      </div>

      <header className="relative z-10 mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5">
        <Brand />
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="hidden sm:inline-flex">
            <Github className="mr-1 size-3" /> client-only
          </Badge>
          <ThemeToggle />
        </div>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-5xl flex-col items-center px-6 pb-16 pt-4 sm:pt-10">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="w-full max-w-xl"
        >
          <div className="mb-6 text-center">
            <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
              Your repository, in a{" "}
              <span className="text-primary">real workspace</span>.
            </h1>
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">
              Browse, edit, diff, and push straight to GitHub — no clone, no
              backend, no server copy of your token.
            </p>
          </div>

          <Card className="glass-card overflow-hidden border-border/80 shadow-2xl">
            <CardHeader className="border-b border-border/60 pb-5">
              <CardTitle className="flex items-center gap-2 text-base">
                <Plug className="size-4 text-primary" /> Connect a repository
              </CardTitle>
              <CardDescription>
                Use a classic or fine-grained token with repository contents
                access.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-5">
              <div className="space-y-1.5">
                <Label htmlFor="token">GitHub token</Label>
                <div className="relative">
                  <Input
                    id="token"
                    type={showToken ? "text" : "password"}
                    value={token}
                    onChange={(e) => {
                      setToken(e.target.value);
                      setError(null);
                      setTestResult(null);
                    }}
                    placeholder="ghp_… or github_pat_…"
                    autoComplete="off"
                    spellCheck={false}
                    className="pr-10 font-mono text-xs"
                  />
                  <button
                    type="button"
                    aria-label={showToken ? "Hide token" : "Show token"}
                    onClick={() => setShowToken((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                  >
                    {showToken ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
                <div className="space-y-1.5">
                  <Label htmlFor="repo">Repository</Label>
                  <Input
                    id="repo"
                    value={repoInput}
                    onChange={(e) => {
                      setRepoInput(e.target.value);
                      setError(null);
                      setTestResult(null);
                    }}
                    placeholder="owner/repo"
                    autoComplete="off"
                    spellCheck={false}
                    className="font-mono text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="branch">Branch</Label>
                  <Input
                    id="branch"
                    value={branch}
                    onChange={(e) => {
                      setBranch(e.target.value);
                      setError(null);
                      setTestResult(null);
                    }}
                    placeholder="main"
                    autoComplete="off"
                    spellCheck={false}
                    className="font-mono text-xs"
                  />
                </div>
              </div>

              <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="size-3.5 accent-emerald-500"
                />
                Remember this token on this device
              </label>

              {error ? (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs leading-5 text-destructive"
                >
                  <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                  <span>{error}</span>
                </div>
              ) : null}

              {testResult ? (
                <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3 py-2.5 text-xs">
                  <div className="flex items-center gap-2 font-medium text-emerald-400">
                    <CheckCircle2 className="size-3.5" />
                    Connected to {testResult.meta.fullName}
                    <Badge
                      variant="outline"
                      className="ml-auto border-emerald-500/25 text-emerald-400"
                    >
                      {testResult.meta.private ? "Private" : "Public"}
                    </Badge>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Star className="size-3" />
                      {testResult.meta.stars.toLocaleString()}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Lock className="size-3" /> default:{" "}
                      {testResult.meta.defaultBranch}
                    </span>
                    <span className="font-mono">
                      head: {testResult.head.sha.slice(0, 7)}
                    </span>
                  </div>
                </div>
              ) : null}

              <div className="flex flex-col gap-2 pt-1 sm:flex-row">
                <Button
                  variant="outline"
                  className="sm:flex-1"
                  onClick={handleTest}
                  disabled={busy || !token || !repoInput}
                >
                  {testing ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Plug className="size-4" />
                  )}
                  Test connection
                </Button>
                <Button
                  className="sm:flex-1"
                  onClick={handleOpen}
                  disabled={busy || !parsed.success}
                >
                  {opening ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <ArrowRight className="size-4" />
                  )}
                  Open workspace
                </Button>
              </div>

              <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-[11px] leading-5 text-muted-foreground">
                <Lock className="mt-0.5 size-3.5 shrink-0 text-primary" />
                <p>
                  The token is stored in{" "}
                  {remember ? "localStorage" : "sessionStorage"} only, and it is
                  sent directly to <code>api.github.com</code>. It is never
                  logged and never appears in a URL.
                </p>
              </div>
            </CardContent>
          </Card>

          <section className="mt-8">
            <h2 className="mb-2 flex items-center gap-1.5 px-1 text-xs font-medium text-muted-foreground">
              <Clock3 className="size-3.5" /> Recent repositories
            </h2>
            {recent.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/80 bg-card/30 px-4 py-6 text-center text-xs text-muted-foreground">
                Repositories you open will show up here.
              </div>
            ) : (
              <ul className="space-y-1.5">
                {recent.map((item) => (
                  <li
                    key={`${item.owner}/${item.repo}`}
                    className="group flex items-center gap-2 rounded-lg border border-border/60 bg-card/40 px-2.5 py-2 transition-colors hover:border-border hover:bg-card/70"
                  >
                    <button
                      type="button"
                      onClick={() => pickRecent(item)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <Github className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate font-mono text-xs">
                        {item.owner}/{item.repo}
                      </span>
                      <span className="ml-auto shrink-0 rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                        {item.branch}
                      </span>
                      <span className="hidden shrink-0 text-[10px] text-muted-foreground sm:inline">
                        {formatRelativeTime(item.openedAt)}
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label="Remove from recent"
                      onClick={() => dropRecent(item)}
                      className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </motion.div>
      </main>
    </div>
  );
      }
