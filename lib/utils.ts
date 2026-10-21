import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { z } from "zod";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/* ---------- Base64 ⇄ UTF-8 ---------- */
export function base64ToUtf8(b64: string): string {
  const cleaned = b64.replace(/\s/g, "");
  if (!cleaned) return "";
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

export function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/* ---------- Storage ---------- */
export const STORAGE_KEYS = {
  session: "repodeck:session",
  remembered: "repodeck:session:remembered",
  recent: "repodeck:recent",
  draftsPrefix: "repodeck:drafts:",
} as const;

export function safeGet(kind: "session" | "local", key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return (kind === "local" ? window.localStorage : window.sessionStorage).getItem(key);
  } catch {
    return null;
  }
}

export function safeSet(
  kind: "session" | "local",
  key: string,
  value: string | null,
): void {
  if (typeof window === "undefined") return;
  try {
    const target = kind === "local" ? window.localStorage : window.sessionStorage;
    if (value === null) target.removeItem(key);
    else target.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export function readJson<T>(kind: "session" | "local", key: string): T | null {
  const raw = safeGet(kind, key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeJson(
  kind: "session" | "local",
  key: string,
  value: unknown,
): void {
  try {
    safeSet(kind, key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

/* ---------- Path helpers ---------- */
export function basename(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? path : path.slice(i + 1);
}

export function dirname(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

export function extname(path: string): string {
  const name = basename(path);
  const i = name.lastIndexOf(".");
  return i <= 0 ? "" : name.slice(i + 1).toLowerCase();
}

export function normalizePath(path: string): string {
  return path
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .replace(/\/{2,}/g, "/");
}

export function isValidPath(path: string): boolean {
  if (!path) return false;
  if (path.startsWith("/")) return false;
  return path
    .split("/")
    .every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

export function parseRepo(input: string): { owner: string; repo: string } | null {
  const trimmed = input.trim();
  const match = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(trimmed);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

/* ---------- Language / MIME ---------- */
const LANG_MAP: Record<string, string> = {
  js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
  ts: "typescript", tsx: "typescript", mts: "typescript", cts: "typescript",
  json: "json", jsonc: "json",
  css: "css", scss: "scss", less: "less",
  html: "html", htm: "html",
  md: "markdown", mdx: "markdown",
  yml: "yaml", yaml: "yaml",
  toml: "ini", xml: "xml", svg: "xml",
  sh: "shell", bash: "shell", zsh: "shell",
  py: "python", rb: "ruby", go: "go", rs: "rust", java: "java", kt: "kotlin",
  c: "c", h: "c", cpp: "cpp", cc: "cpp", hpp: "cpp", cs: "csharp",
  php: "php", sql: "sql",
  graphql: "graphql", gql: "graphql",
  dockerfile: "dockerfile", vue: "vue", svelte: "svelte",
};

export function detectLanguage(path: string): string {
  const name = basename(path).toLowerCase();
  if (name === "dockerfile") return "dockerfile";
  if (name === "makefile") return "makefile";
  if (name.startsWith(".env")) return "ini";
  return LANG_MAP[extname(path)] ?? "plaintext";
}

const IMAGE_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "ico", "bmp", "avif",
]);

const BINARY_EXTENSIONS = new Set([
  ...IMAGE_EXTENSIONS,
  "woff", "woff2", "ttf", "otf", "eot",
  "zip", "gz", "tar", "rar", "7z",
  "pdf", "mp4", "webm", "mp3", "wav", "ogg",
  "wasm", "exe", "dll", "so", "dylib", "class", "jar",
]);

export function isImagePath(path: string): boolean {
  return IMAGE_EXTENSIONS.has(extname(path));
}

export function isBinaryPath(path: string): boolean {
  return BINARY_EXTENSIONS.has(extname(path));
}

const MIME_MAP: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
  gif: "image/gif", webp: "image/webp", ico: "image/x-icon",
  bmp: "image/bmp", avif: "image/avif", svg: "image/svg+xml",
};

export function getMimeType(path: string): string {
  return MIME_MAP[extname(path)] ?? "application/octet-stream";
}

/* ---------- Misc formatting ---------- */
export function formatRelativeTime(timestamp: number): string {
  const diff = timestamp - Date.now();
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 31_536_000_000],
    ["month", 2_592_000_000],
    ["week", 604_800_000],
    ["day", 86_400_000],
    ["hour", 3_600_000],
    ["minute", 60_000],
    ["second", 1_000],
  ];
  for (const [unit, ms] of units) {
    if (abs >= ms) return rtf.format(Math.round(diff / ms), unit);
  }
  return "just now";
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), 3);
  const value = bytes / 1024 ** i;
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    target.isContentEditable
  );
}

/* ---------- Clipboard (iframe-safe) ---------- */
export function isInIframe(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

let manualCopyOverlay: HTMLElement | null = null;

function openManualCopyModal(text: string): void {
  if (typeof document === "undefined") return;
  if (manualCopyOverlay) {
    manualCopyOverlay.remove();
    manualCopyOverlay = null;
  }

  const overlay = document.createElement("div");
  overlay.style.cssText =
    "position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;padding:16px;";

  const card = document.createElement("div");
  card.style.cssText =
    "background:#0d1117;border:1px solid #30363d;border-radius:12px;padding:16px;max-width:720px;width:100%;max-height:82vh;display:flex;flex-direction:column;gap:8px;color:#e6edf3;font-family:ui-sans-serif,system-ui,sans-serif;box-shadow:0 24px 48px -12px rgba(0,0,0,.6);";

  const title = document.createElement("div");
  title.textContent = "Copy manually";
  title.style.cssText = "font-size:13px;font-weight:600;";

  const hint = document.createElement("div");
  hint.textContent =
    "Your browser blocked the clipboard in this context. Select all, copy (Ctrl/Cmd+C), then close this dialog.";
  hint.style.cssText = "font-size:11px;color:#8b949e;line-height:1.5;";

  const ta = document.createElement("textarea");
  ta.value = text;
  ta.readOnly = true;
  ta.style.cssText =
    "flex:1;min-height:220px;width:100%;background:#161b22;color:#e6edf3;border:1px solid #30363d;border-radius:6px;padding:8px;font-family:ui-monospace,SFMono-Regular,monospace;font-size:11px;resize:vertical;outline:none;";

  const btnRow = document.createElement("div");
  btnRow.style.cssText = "display:flex;justify-content:flex-end;gap:8px;";

  const close = document.createElement("button");
  close.textContent = "Close";
  close.style.cssText =
    "background:#10b981;color:#052e1c;border:0;border-radius:6px;padding:6px 14px;font-size:12px;font-weight:600;cursor:pointer;";
  close.onclick = () => {
    overlay.remove();
    manualCopyOverlay = null;
  };

  btnRow.append(close);
  card.append(title, hint, ta, btnRow);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
  manualCopyOverlay = overlay;

  overlay.onclick = (e) => {
    if (e.target === overlay) {
      overlay.remove();
      manualCopyOverlay = null;
    }
  };

  requestAnimationFrame(() => {
    ta.focus();
    ta.select();
  });
}

/**
 * Tries clipboard API → execCommand → modal fallback.
 * Returns true only when the clipboard copy actually succeeded.
 */
export async function copyWithFallback(text: string): Promise<boolean> {
  if (typeof navigator === "undefined") return false;

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }

  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "0";
    ta.style.left = "0";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    if (ok) return true;
  } catch {
    /* fall through */
  }

  openManualCopyModal(text);
  return false;
}

/** Backwards-compatible alias used by older call sites. */
export async function copyToClipboard(text: string): Promise<boolean> {
  return copyWithFallback(text);
}

/* ---------- Misc ---------- */
export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  delay = 300,
): (...args: Args) => void {
  let timer: number | undefined;
  return (...args: Args) => {
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), delay);
  };
}

/* ---------- Zod schemas & types ---------- */
export const sessionSchema = z.object({
  token: z
    .string()
    .trim()
    .min(10, "Enter a valid GitHub token (usually 40+ characters)."),
  repo: z
    .string()
    .trim()
    .regex(
      /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/,
      "Repository must be in owner/repo format.",
    ),
  branch: z
    .string()
    .trim()
    .min(1, "Branch is required.")
    .regex(/^[^\s]+$/, "Branch cannot contain spaces."),
  remember: z.boolean(),
});

export type SessionInput = z.infer<typeof sessionSchema>;

export interface RepoSession {
  token: string;
  owner: string;
  repo: string;
  branch: string;
  remember: boolean;
}

export interface RecentRepo {
  owner: string;
  repo: string;
  branch: string;
  openedAt: number;
}

export function readRecentRepos(): RecentRepo[] {
  const stored = readJson<RecentRepo[]>("local", STORAGE_KEYS.recent);
  if (!Array.isArray(stored)) return [];
  return stored.filter(
    (item) =>
      typeof item?.owner === "string" &&
      typeof item?.repo === "string" &&
      typeof item?.branch === "string" &&
      typeof item?.openedAt === "number",
  );
}

export function addRecentRepo(next: RecentRepo): RecentRepo[] {
  const current = readRecentRepos();
  const merged = [
    next,
    ...current.filter(
      (item) => !(item.owner === next.owner && item.repo === next.repo),
    ),
  ].slice(0, 8);
  writeJson("local", STORAGE_KEYS.recent, merged);
  return merged;
}

export function removeRecentRepo(owner: string, repo: string): RecentRepo[] {
  const current = readRecentRepos().filter(
    (item) => !(item.owner === owner && item.repo === repo),
  );
  writeJson("local", STORAGE_KEYS.recent, current);
  return current;
}
