import JSZip from "jszip";
import { isBinaryPath, normalizePath } from "@/lib/utils";

const MAX_FILE_SIZE = 5 * 1024 * 1024;

export interface IngestResult {
  added: string[];
  skipped: Array<{ path: string; reason: string }>;
}

export async function ingestFiles(
  files: File[],
  addFile: (path: string, content: string) => boolean,
): Promise<IngestResult> {
  const result: IngestResult = { added: [], skipped: [] };

  for (const file of files) {
    // `webkitRelativePath` is non-standard but widely supported for folder
    // uploads. Cast to intersection — do NOT extend File (its version is
    // required, ours is optional, so extending would clash).
    const relPath =
      (file as File & { webkitRelativePath?: string }).webkitRelativePath ||
      file.name;
    const cleanPath = normalizePath(relPath);
    if (!cleanPath) continue;

    if (cleanPath.toLowerCase().endsWith(".zip")) {
      try {
        const buffer = await file.arrayBuffer();
        const zip = await JSZip.loadAsync(buffer);
        for (const [zipPath, entry] of Object.entries(zip.files)) {
          if (entry.dir) continue;
          const target = normalizePath(zipPath);
          if (!target) continue;
          if (isBinaryPath(target)) {
            result.skipped.push({ path: target, reason: "binary" });
            continue;
          }
          try {
            const content = await entry.async("string");
            const ok = addFile(target, content);
            if (ok) result.added.push(target);
            else result.skipped.push({ path: target, reason: "exists" });
          } catch {
            result.skipped.push({ path: target, reason: "read error" });
          }
        }
      } catch {
        result.skipped.push({ path: cleanPath, reason: "zip parse error" });
      }
      continue;
    }

    if (isBinaryPath(cleanPath)) {
      result.skipped.push({ path: cleanPath, reason: "binary" });
      continue;
    }

    if (file.size > MAX_FILE_SIZE) {
      result.skipped.push({ path: cleanPath, reason: "too large" });
      continue;
    }

    try {
      const content = await file.text();
      const ok = addFile(cleanPath, content);
      if (ok) result.added.push(cleanPath);
      else result.skipped.push({ path: cleanPath, reason: "exists" });
    } catch {
      result.skipped.push({ path: cleanPath, reason: "read error" });
    }
  }

  return result;
}
