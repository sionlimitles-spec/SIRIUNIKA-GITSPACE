import JSZip from "jszip";
import { copyWithFallback } from "@/lib/utils";

export const DEFAULT_IGNORE_PATTERNS = [
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".open-next",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lockb",
  "*.min.js",
  "*.map",
  "*.png",
  "*.jpg",
  "*.jpeg",
  "*.gif",
  "*.webp",
  "*.ico",
  "*.woff",
  "*.woff2",
  "*.ttf",
  "*.otf",
  "*.pdf",
  "*.zip",
  "*.wasm",
  "*.mp4",
  "*.webm",
];

const MAX_BYTES = 1_000_000;

export function matchesPattern(path: string, pattern: string): boolean {
  const cleanPattern = pattern.trim();
  if (!cleanPattern) return false;

  if (cleanPattern.startsWith("*.")) {
    return path.toLowerCase().endsWith(cleanPattern.slice(1).toLowerCase());
  }
  if (cleanPattern.endsWith("/*")) {
    return path.startsWith(cleanPattern.slice(0, -1));
  }
  if (path === cleanPattern) return true;
  if (path.includes(`/${cleanPattern}/`)) return true;
  if (path.startsWith(`${cleanPattern}/`)) return true;
  const base = path.split("/").pop();
  return base === cleanPattern;
}

export function shouldIgnore(
  path: string,
  size: number | undefined,
  patterns: string[],
): boolean {
  if (size !== undefined && size > MAX_BYTES) return true;
  return patterns.some((p) => matchesPattern(path, p));
}

export interface ExportFile {
  path: string;
  content: string;
}

export function buildCombinedText(files: ExportFile[]): string {
  return files
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((f) => `===== ${f.path} =====\n${f.content}`)
    .join("\n\n");
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function makeExportName(
  owner: string,
  repo: string,
  branch: string,
  ext: string,
): string {
  const date = new Date().toISOString().slice(0, 10);
  return `${owner}-${repo}-${branch}-${date}.${ext}`;
}

export function downloadText(files: ExportFile[], filename: string): void {
  const text = buildCombinedText(files);
  downloadBlob(new Blob([text], { type: "text/plain;charset=utf-8" }), filename);
}

export async function downloadZip(
  files: ExportFile[],
  filename: string,
): Promise<void> {
  const zip = new JSZip();
  for (const file of files) {
    zip.file(file.path, file.content);
  }
  const blob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  downloadBlob(blob, filename);
}

export async function copyCombined(files: ExportFile[]): Promise<boolean> {
  const text = buildCombinedText(files);
  return copyWithFallback(text);
}
