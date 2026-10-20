import { Octokit } from "@octokit/rest";
import { base64ToUtf8 } from "@/lib/utils";

export interface TreeEntry {
  path: string;
  mode: string;
  type: string;
  sha: string;
  size?: number;
}

export interface TreeNode {
  name: string;
  path: string;
  type: "file" | "dir";
  sha?: string;
  size?: number;
  children?: TreeNode[];
}

export interface RepoMeta {
  fullName: string;
  owner: string;
  name: string;
  defaultBranch: string;
  private: boolean;
  description: string | null;
  stars: number;
  language: string | null;
  htmlUrl: string;
  avatarUrl: string;
}

export interface BranchHead {
  sha: string;
  treeSha: string;
}

export interface BlobResult {
  text: string;
  base64: string;
  size: number;
}

export interface PollResult {
  notModified: boolean;
  sha: string;
  etag: string;
}

export type GithubErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "validation"
  | "rate_limit"
  | "network"
  | "unknown";

export class GithubError extends Error {
  code: GithubErrorCode;
  status?: number;
  resetAt?: number;
  remaining?: number;

  constructor(
    code: GithubErrorCode,
    message: string,
    extra: { status?: number; resetAt?: number; remaining?: number } = {},
  ) {
    super(message);
    this.name = "GithubError";
    this.code = code;
    this.status = extra.status;
    this.resetAt = extra.resetAt;
    this.remaining = extra.remaining;
  }
}

interface HttpLike {
  status?: number;
  name?: string;
  message?: string;
  response?: { headers?: Record<string, string | number | undefined> };
}

function header(
  headers: Record<string, string | number | undefined> | undefined,
  key: string,
): string | number | undefined {
  if (!headers) return undefined;
  return headers[key] ?? headers[key.toLowerCase()];
}

export function toGithubError(error: unknown): GithubError {
  if (error instanceof GithubError) return error;

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return new GithubError(
      "network",
      "You appear to be offline. Reconnect and try again.",
    );
  }

  const err = error as HttpLike | undefined;
  const status = typeof err?.status === "number" ? err.status : undefined;
  const headers = err?.response?.headers;
  const remainingRaw = header(headers, "x-ratelimit-remaining");
  const resetRaw = header(headers, "x-ratelimit-reset");
  const remaining =
    remainingRaw !== undefined ? Number(remainingRaw) : undefined;
  const resetSeconds =
    resetRaw !== undefined ? Number(resetRaw) : undefined;
  const resetAt =
    Number.isFinite(resetSeconds) && resetSeconds! > 0
      ? resetSeconds! * 1000
      : undefined;

  const resetLabel = resetAt
    ? new Date(resetAt).toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "soon";

  if (status === 401) {
    return new GithubError(
      "unauthorized",
      "Invalid or expired GitHub token. Create a new token with repo scope and try again.",
      { status },
    );
  }
  if (status === 403) {
    if (Number.isFinite(remaining) && remaining === 0) {
      return new GithubError(
        "rate_limit",
        `GitHub API rate limit exceeded. Resets at ${resetLabel}.`,
        { status, resetAt, remaining },
      );
    }
    return new GithubError(
      "forbidden",
      "Access forbidden. Your token may not have permission for this repository.",
      { status, resetAt, remaining },
    );
  }
  if (status === 404) {
    return new GithubError(
      "not_found",
      "Repository or branch not found. Check owner/repo and branch, and confirm token access.",
      { status },
    );
  }
  if (status === 409) {
    return new GithubError(
      "conflict",
      "The remote changed while you were editing. Reload or resolve conflicts.",
      { status },
    );
  }
  if (status === 422) {
    return new GithubError(
      "validation",
      "GitHub rejected the request. The branch may have moved or the data is invalid.",
      { status },
    );
  }
  if (
    err?.name === "HttpError" ||
    err?.name === "TypeError" ||
    err?.message?.toLowerCase().includes("fetch")
  ) {
    return new GithubError(
      "network",
      "Network request failed. Check your connection or GitHub availability.",
      { status },
    );
  }
  return new GithubError(
    "unknown",
    err?.message?.slice(0, 240) ?? "GitHub request failed.",
    { status, remaining, resetAt },
  );
}

function sortNodes(nodes: TreeNode[]): TreeNode[] {
  return [...nodes].sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, {
      numeric: true,
      sensitivity: "base",
    });
  });
}

export function buildTree(entries: TreeEntry[]): TreeNode[] {
  const root: TreeNode = { name: "", path: "", type: "dir", children: [] };
  const map = new Map<string, TreeNode>([["", root]]);

  for (const entry of entries) {
    if (entry.type !== "blob" && entry.type !== "tree") continue;
    if (!entry.path) continue;

    const parts = entry.path.split("/");
    let parentPath = "";

    for (let i = 0; i < parts.length; i += 1) {
      const isLeaf = i === parts.length - 1;
      const path = parts.slice(0, i + 1).join("/");

      if (!map.has(path)) {
        const node: TreeNode = {
          name: parts[i],
          path,
          type: isLeaf && entry.type === "blob" ? "file" : "dir",
          children: isLeaf && entry.type === "blob" ? undefined : [],
          sha: isLeaf && entry.type === "blob" ? entry.sha : undefined,
          size: isLeaf && entry.type === "blob" ? entry.size : undefined,
        };
        map.set(path, node);
        const parent = map.get(parentPath);
        if (parent) {
          parent.children = parent.children ?? [];
          parent.children.push(node);
        }
      }
      parentPath = path;
    }
  }

  const sortDeep = (nodes: TreeNode[]): TreeNode[] =>
    sortNodes(
      nodes.map((n) =>
        n.children ? { ...n, children: sortDeep(n.children) } : n,
      ),
    );

  return sortDeep(root.children ?? []);
}

export function findNode(nodes: TreeNode[], path: string): TreeNode | null {
  for (const node of nodes) {
    if (node.path === path) return node;
    if (node.children && path.startsWith(`${node.path}/`)) {
      const found = findNode(node.children, path);
      if (found) return found;
    }
  }
  return null;
}

export function flattenVisible(
  nodes: TreeNode[],
  expanded: Record<string, boolean>,
  depth = 0,
): Array<{ node: TreeNode; depth: number }> {
  const out: Array<{ node: TreeNode; depth: number }> = [];
  for (const node of nodes) {
    out.push({ node, depth });
    if (node.type === "dir" && expanded[node.path] && node.children) {
      out.push(...flattenVisible(node.children, expanded, depth + 1));
    }
  }
  return out;
}

export function flattenFiles(
  nodes: TreeNode[],
  depth = 0,
): Array<{ node: TreeNode; depth: number }> {
  const out: Array<{ node: TreeNode; depth: number }> = [];
  for (const node of nodes) {
    if (node.type === "file") out.push({ node, depth });
    else if (node.children) out.push(...flattenFiles(node.children, depth + 1));
  }
  return out;
}

export function collectPaths(node: TreeNode): string[] {
  if (node.type === "file") return [node.path];
  const paths: string[] = [];
  for (const child of node.children ?? []) paths.push(...collectPaths(child));
  return paths;
}

export function ensureDir(nodes: TreeNode[], path: string): TreeNode[] {
  if (!path) return nodes;
  if (findNode(nodes, path)) return nodes;
  const parent = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
  const withParent = ensureDir(nodes, parent);
  return insertNode(withParent, parent, {
    name: path.slice(path.lastIndexOf("/") + 1),
    path,
    type: "dir",
    children: [],
  });
}

export function insertNode(
  nodes: TreeNode[],
  parentPath: string,
  node: TreeNode,
): TreeNode[] {
  if (!parentPath) return sortNodes([...nodes, node]);
  return nodes.map((current) => {
    if (current.path === parentPath && current.type === "dir") {
      return {
        ...current,
        children: sortNodes([...(current.children ?? []), node]),
      };
    }
    if (
      current.type === "dir" &&
      current.children &&
      parentPath.startsWith(`${current.path}/`)
    ) {
      return {
        ...current,
        children: insertNode(current.children, parentPath, node),
      };
    }
    return current;
  });
}

export function removeNode(nodes: TreeNode[], path: string): TreeNode[] {
  const walk = (items: TreeNode[]): TreeNode[] =>
    items
      .filter((n) => n.path !== path)
      .map((n) => (n.children ? { ...n, children: walk(n.children) } : n));
  return walk(nodes);
}

export function renameNodePath(
  nodes: TreeNode[],
  oldPath: string,
  newPath: string,
): TreeNode[] {
  const walk = (items: TreeNode[]): TreeNode[] =>
    items.map((node) => {
      if (node.path === oldPath || node.path.startsWith(`${oldPath}/`)) {
        const next = newPath + node.path.slice(oldPath.length);
        return {
          ...node,
          name: next.slice(next.lastIndexOf("/") + 1),
          path: next,
          children: node.children ? walk(node.children) : undefined,
        };
      }
      return node;
    });
  return walk(nodes);
}

export function getAncestorPaths(path: string): string[] {
  const parts = path.split("/");
  const result: string[] = [];
  for (let i = 1; i < parts.length; i += 1) {
    result.push(parts.slice(0, i).join("/"));
  }
  return result;
}

export class GithubClient {
  owner: string;
  repo: string;
  private octokit: Octokit;
  private _rateLimitRemaining?: number;
  private onRateLimit?: (n: number | undefined) => void;

  constructor(
    token: string,
    owner: string,
    repo: string,
    onRateLimit?: (n: number | undefined) => void,
  ) {
    this.owner = owner;
    this.repo = repo;
    this.onRateLimit = onRateLimit;
    this.octokit = new Octokit({ auth: token, userAgent: "RepoDeck/1.0" });

    this.octokit.hook.after("request", (res) => {
      const headers = res.headers as Record<string, string | number>;
      const remaining = Number(headers["x-ratelimit-remaining"]);
      if (Number.isFinite(remaining)) {
        this._rateLimitRemaining = remaining;
        this.onRateLimit?.(remaining);
      }
    });
  }

  get rateLimitRemaining(): number | undefined {
    return this._rateLimitRemaining;
  }

  private async wrap<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      throw toGithubError(error);
    }
  }

  async getRepo(): Promise<RepoMeta> {
    const { data } = await this.wrap(() =>
      this.octokit.repos.get({ owner: this.owner, repo: this.repo }),
    );
    return {
      fullName: data.full_name,
      owner: data.owner.login,
      name: data.name,
      defaultBranch: data.default_branch,
      private: data.private,
      description: data.description ?? null,
      stars: data.stargazers_count ?? 0,
      language: data.language ?? null,
      htmlUrl: data.html_url,
      avatarUrl: data.owner.avatar_url,
    };
  }

  async listBranches(): Promise<string[]> {
    const branches: string[] = [];
    for (let page = 1; page <= 10; page += 1) {
      const { data } = await this.wrap(() =>
        this.octokit.repos.listBranches({
          owner: this.owner,
          repo: this.repo,
          per_page: 100,
          page,
        }),
      );
      branches.push(...data.map((b) => b.name));
      if (data.length < 100) break;
    }
    return branches;
  }

  async getBranchHead(branch: string): Promise<BranchHead> {
    const { data: ref } = await this.wrap(() =>
      this.octokit.git.getRef({
        owner: this.owner,
        repo: this.repo,
        ref: `heads/${branch}`,
      }),
    );
    const sha = ref.object.sha;
    const { data: commit } = await this.wrap(() =>
      this.octokit.git.getCommit({
        owner: this.owner,
        repo: this.repo,
        commit_sha: sha,
      }),
    );
    return { sha, treeSha: commit.tree.sha };
  }

  async pollBranch(branch: string, etag?: string): Promise<PollResult> {
    try {
      const res = await this.octokit.request(
        "GET /repos/{owner}/{repo}/git/ref/{ref}",
        {
          owner: this.owner,
          repo: this.repo,
          ref: `heads/${branch}`,
          headers: etag ? { "if-none-match": etag } : {},
        },
      );
      const data = res.data as { object: { sha: string } };
      const newEtag = (res.headers.etag as string | undefined) ?? "";
      return { notModified: false, sha: data.object.sha, etag: newEtag };
    } catch (error) {
      const err = error as { status?: number };
      if (err.status === 304) {
        return { notModified: true, sha: "", etag: etag ?? "" };
      }
      throw toGithubError(error);
    }
  }

  async getTree(
    treeSha: string,
  ): Promise<{ entries: TreeEntry[]; truncated: boolean }> {
    const { data } = await this.wrap(() =>
      this.octokit.git.getTree({
        owner: this.owner,
        repo: this.repo,
        tree_sha: treeSha,
        recursive: "1",
      }),
    );
    const entries: TreeEntry[] = (data.tree ?? [])
      .filter(
        (e): e is typeof e & { path: string; sha: string } =>
          typeof e.path === "string" && typeof e.sha === "string",
      )
      .map((e) => ({
        path: e.path,
        mode: e.mode ?? "100644",
        type: e.type ?? "blob",
        sha: e.sha,
        size: e.size,
      }));
    return { entries, truncated: Boolean(data.truncated) };
  }

  async getBlob(sha: string): Promise<BlobResult> {
    const { data } = await this.wrap(() =>
      this.octokit.git.getBlob({
        owner: this.owner,
        repo: this.repo,
        file_sha: sha,
      }),
    );
    const base64 = data.content ?? "";
    const text = data.encoding === "base64" ? base64ToUtf8(base64) : base64;
    return { text, base64, size: data.size ?? 0 };
  }

  async createBlob(content: string): Promise<string> {
    const { data } = await this.wrap(() =>
      this.octokit.git.createBlob({
        owner: this.owner,
        repo: this.repo,
        content,
        encoding: "utf-8",
      }),
    );
    return data.sha;
  }

  async createTree(
    baseTree: string,
    tree: Array<{
      path: string;
      mode: "100644";
      type: "blob";
      sha: string | null;
    }>,
  ): Promise<string> {
    const { data } = await this.wrap(() =>
      this.octokit.git.createTree({
        owner: this.owner,
        repo: this.repo,
        base_tree: baseTree,
        tree: tree as never,
      }),
    );
    return data.sha;
  }

  async createCommit(
    message: string,
    treeSha: string,
    parentSha: string,
  ): Promise<{ sha: string; htmlUrl: string }> {
    const { data } = await this.wrap(() =>
      this.octokit.git.createCommit({
        owner: this.owner,
        repo: this.repo,
        message,
        tree: treeSha,
        parents: [parentSha],
      }),
    );
    return { sha: data.sha, htmlUrl: data.html_url };
  }

  async updateRef(branch: string, sha: string): Promise<void> {
    await this.wrap(() =>
      this.octokit.git.updateRef({
        owner: this.owner,
        repo: this.repo,
        ref: `heads/${branch}`,
        sha,
        force: false,
      }),
    );
  }

  async createRef(branch: string, sha: string): Promise<void> {
    await this.wrap(() =>
      this.octokit.git.createRef({
        owner: this.owner,
        repo: this.repo,
        ref: `refs/heads/${branch}`,
        sha,
      }),
    );
  }

  async createPullRequest(params: {
    title: string;
    head: string;
    base: string;
    body?: string;
  }): Promise<{ number: number; htmlUrl: string }> {
    const { data } = await this.wrap(() =>
      this.octokit.pulls.create({
        owner: this.owner,
        repo: this.repo,
        title: params.title,
        head: params.head,
        base: params.base,
        body: params.body,
      }),
    );
    return { number: data.number, htmlUrl: data.html_url };
  }
}
