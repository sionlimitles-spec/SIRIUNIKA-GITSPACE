import { create } from "zustand";
import {
  ensureDir,
  findNode,
  getAncestorPaths,
  insertNode,
  removeNode,
  renameNodePath,
  collectPaths,
  type TreeNode,
} from "@/lib/github";
import {
  STORAGE_KEYS,
  basename,
  dirname,
  isValidPath,
  normalizePath,
  readJson,
  safeSet,
  writeJson,
  type RepoSession,
} from "@/lib/utils";

export type FileStatus = "added" | "modified" | "deleted";
export type ActivityView =
  | "explorer"
  | "changes"
  | "history"
  | "settings";

export interface FileDraft {
  path: string;
  content: string;
  originalContent: string | null;
  baseSha: string | null;
  status: FileStatus;
}

export interface OriginalFile {
  content: string;
  sha: string;
}

export type SyncStatus = "synced" | "checking" | "error";

export interface PushResult {
  newHeadSha: string;
  blobs: Record<string, string>;
}

export interface EditorSettings {
  fontSize: number;
  tabSize: number;
  wordWrap: "on" | "off";
  minimap: boolean;
}

const DEFAULT_SETTINGS: EditorSettings = {
  fontSize: 13,
  tabSize: 2,
  wordWrap: "on",
  minimap: false,
};

const SETTINGS_KEY = "repodeck:editor-settings";
const RECENT_FILES_KEY = "repodeck:recent-files";

function loadSettings(): EditorSettings {
  const stored = readJson<Partial<EditorSettings>>("local", SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
}

function loadRecentFiles(): string[] {
  const stored = readJson<string[]>("local", RECENT_FILES_KEY);
  if (!Array.isArray(stored)) return [];
  return stored.filter((p) => typeof p === "string").slice(0, 20);
}

interface Store {
  session: RepoSession | null;
  setSession: (session: RepoSession | null) => void;
  hydrateSession: () => void;

  tree: TreeNode[];
  treeTruncated: boolean;
  treeLoaded: boolean;
  setTree: (tree: TreeNode[], truncated: boolean) => void;

  expanded: Record<string, boolean>;
  toggleDir: (path: string) => void;
  expandTo: (path: string) => void;

  activityView: ActivityView;
  setActivityView: (view: ActivityView) => void;

  terminalOpen: boolean;
  toggleTerminal: () => void;
  setTerminalOpen: (open: boolean) => void;

  tabs: string[];
  activePath: string | null;
  recentFiles: string[];
  openTab: (path: string) => void;
  closeTab: (path: string) => void;
  setActive: (path: string) => void;

  originals: Record<string, OriginalFile>;
  drafts: Record<string, FileDraft>;
  registerOriginal: (path: string, content: string, sha: string) => void;
  updateContent: (path: string, content: string) => void;
  addFile: (path: string, content?: string) => boolean;
  addFolder: (path: string) => boolean;
  renameFile: (oldPath: string, newPath: string) => string | null;
  deleteFile: (path: string) => void;
  duplicateFile: (path: string) => boolean;
  revertFile: (path: string) => void;
  discardAll: () => void;

  hydrated: boolean;
  hydratedFor: string | null;
  hydrateDrafts: () => void;

  baseHeadSha: string | null;
  setBaseHeadSha: (sha: string | null) => void;
  remoteChanged: boolean;
  setRemoteChanged: (v: boolean) => void;
  syncStatus: SyncStatus;
  setSyncStatus: (s: SyncStatus) => void;
  rateLimitRemaining: number | undefined;
  setRateLimitRemaining: (n: number | undefined) => void;

  settings: EditorSettings;
  updateSettings: (patch: Partial<EditorSettings>) => void;

  applyPush: (result: PushResult) => void;
  reset: () => void;
}

export const DRAFTS_KEY = (s: RepoSession): string =>
  `${STORAGE_KEYS.draftsPrefix}${s.owner}/${s.repo}@${s.branch}`;

function mergeAddedDrafts(
  tree: TreeNode[],
  drafts: Record<string, FileDraft>,
): TreeNode[] {
  let next = tree;
  for (const draft of Object.values(drafts)) {
    if (draft.status !== "added") continue;
    if (findNode(next, draft.path)) continue;
    const parent = dirname(draft.path);
    if (parent) next = ensureDir(next, parent);
    next = insertNode(next, parent, {
      name: basename(draft.path),
      path: draft.path,
      type: "file",
    });
  }
  return next;
}

const initialState = {
  session: null as RepoSession | null,
  tree: [] as TreeNode[],
  treeTruncated: false,
  treeLoaded: false,
  expanded: {} as Record<string, boolean>,
  activityView: "explorer" as ActivityView,
  terminalOpen: false,
  tabs: [] as string[],
  activePath: null as string | null,
  recentFiles: [] as string[],
  originals: {} as Record<string, OriginalFile>,
  drafts: {} as Record<string, FileDraft>,
  hydrated: false,
  hydratedFor: null as string | null,
  baseHeadSha: null as string | null,
  remoteChanged: false,
  syncStatus: "synced" as SyncStatus,
  rateLimitRemaining: undefined as number | undefined,
  settings: DEFAULT_SETTINGS,
};

export const useStore = create<Store>()((set, get) => ({
  ...initialState,

  setSession: (session) => {
    if (session) {
      const target: "local" | "session" = session.remember ? "local" : "session";
      const key = session.remember
        ? STORAGE_KEYS.remembered
        : STORAGE_KEYS.session;
      safeSet("session", STORAGE_KEYS.session, null);
      safeSet("local", STORAGE_KEYS.remembered, null);
      writeJson(target, key, session);
    } else {
      safeSet("session", STORAGE_KEYS.session, null);
      safeSet("local", STORAGE_KEYS.remembered, null);
    }
    set({ session });
  },

  hydrateSession: () => {
    if (typeof window === "undefined") return;
    if (get().session) return;
    const fromSession = readJson<RepoSession>("session", STORAGE_KEYS.session);
    const fromLocal = readJson<RepoSession>("local", STORAGE_KEYS.remembered);
    const session = fromSession ?? fromLocal;
    set({
      session: session ?? null,
      settings: loadSettings(),
      recentFiles: loadRecentFiles(),
    });
  },

  setTree: (tree, truncated) => {
    const state = get();
    set({
      tree: state.hydrated ? mergeAddedDrafts(tree, state.drafts) : tree,
      treeTruncated: truncated,
      treeLoaded: true,
    });
  },

  toggleDir: (path) =>
    set((s) => ({
      expanded: { ...s.expanded, [path]: !s.expanded[path] },
    })),

  expandTo: (path) =>
    set((s) => {
      const expanded = { ...s.expanded };
      for (const ancestor of getAncestorPaths(path)) expanded[ancestor] = true;
      return { expanded };
    }),

  setActivityView: (view) => set({ activityView: view }),

  toggleTerminal: () => set((s) => ({ terminalOpen: !s.terminalOpen })),
  setTerminalOpen: (open) => set({ terminalOpen: open }),

  openTab: (path) => {
    const s = get();
    const tabs = s.tabs.includes(path) ? s.tabs : [...s.tabs, path];
    const expanded = { ...s.expanded };
    for (const ancestor of getAncestorPaths(path)) expanded[ancestor] = true;
    const recentFiles = [
      path,
      ...s.recentFiles.filter((p) => p !== path),
    ].slice(0, 20);
    writeJson("local", RECENT_FILES_KEY, recentFiles);
    set({ tabs, activePath: path, expanded, recentFiles });
  },

  closeTab: (path) => {
    const s = get();
    const idx = s.tabs.indexOf(path);
    const tabs = s.tabs.filter((t) => t !== path);
    const activePath =
      s.activePath === path
        ? tabs[Math.max(0, idx - 1)] ?? tabs[0] ?? null
        : s.activePath;
    set({ tabs, activePath });
  },

  setActive: (path) => {
    const s = get();
    const recentFiles = [
      path,
      ...s.recentFiles.filter((p) => p !== path),
    ].slice(0, 20);
    writeJson("local", RECENT_FILES_KEY, recentFiles);
    set({ activePath: path, recentFiles });
  },

  registerOriginal: (path, content, sha) => {
    const s = get();
    if (s.drafts[path]) return;
    if (s.originals[path]) return;
    set({
      originals: { ...s.originals, [path]: { content, sha } },
    });
  },

  updateContent: (path, content) => {
    const s = get();
    const original = s.originals[path];
    const existing = s.drafts[path];

    const originalContent =
      existing?.originalContent ?? original?.content ?? null;
    const baseSha = existing?.baseSha ?? original?.sha ?? null;

    if (
      originalContent !== null &&
      content === originalContent &&
      existing?.status !== "added"
    ) {
      if (!existing) return;
      const drafts = { ...s.drafts };
      delete drafts[path];
      set({ drafts });
      return;
    }

    const status: FileStatus = originalContent === null ? "added" : "modified";

    set({
      drafts: {
        ...s.drafts,
        [path]: { path, content, originalContent, baseSha, status },
      },
    });
  },

  addFile: (path, content = "") => {
    const clean = normalizePath(path);
    if (!isValidPath(clean)) return false;
    const s = get();
    if (findNode(s.tree, clean)) return false;

    const parent = dirname(clean);
    let tree = s.tree;
    if (parent) tree = ensureDir(tree, parent);
    tree = insertNode(tree, parent, {
      name: basename(clean),
      path: clean,
      type: "file",
    });

    const draft: FileDraft = {
      path: clean,
      content,
      originalContent: null,
      baseSha: null,
      status: "added",
    };

    set({
      tree,
      drafts: { ...s.drafts, [clean]: draft },
      tabs: s.tabs.includes(clean) ? s.tabs : [...s.tabs, clean],
      activePath: clean,
      expanded: parent ? { ...s.expanded, [parent]: true } : s.expanded,
    });
    return true;
  },

  addFolder: (path) => {
    const clean = normalizePath(path);
    if (!isValidPath(clean)) return false;
    const s = get();
    if (findNode(s.tree, clean)) return false;

    let tree = ensureDir(s.tree, clean);
    const placeholder = `${clean}/.gitkeep`;
    tree = insertNode(tree, clean, {
      name: ".gitkeep",
      path: placeholder,
      type: "file",
    });

    set({
      tree,
      drafts: {
        ...s.drafts,
        [placeholder]: {
          path: placeholder,
          content: "",
          originalContent: null,
          baseSha: null,
          status: "added",
        },
      },
      expanded: { ...s.expanded, [clean]: true },
    });
    return true;
  },

  renameFile: (oldPath, newPath) => {
    const cleanOld = normalizePath(oldPath);
    const cleanNew = normalizePath(newPath);
    if (!isValidPath(cleanNew)) return "Enter a valid path.";
    if (cleanOld === cleanNew) return null;

    const s = get();
    const node = findNode(s.tree, cleanOld);
    if (!node) return "Path not found.";
    if (findNode(s.tree, cleanNew)) return "That path already exists.";

    const files = collectPaths(node);
    const drafts = { ...s.drafts };
    const originals = { ...s.originals };

    for (const oldFile of files) {
      const newFile = cleanNew + oldFile.slice(cleanOld.length);
      const draft = drafts[oldFile];

      if (draft?.status === "added") {
        drafts[newFile] = { ...draft, path: newFile };
        delete drafts[oldFile];
        continue;
      }

      const original = originals[oldFile];
      if (!draft && !original) continue;

      const content = draft?.content ?? original.content;
      const originalContent = draft?.originalContent ?? original.content;
      const baseSha = draft?.baseSha ?? original.sha;

      drafts[oldFile] = {
        path: oldFile,
        content: "",
        originalContent,
        baseSha,
        status: "deleted",
      };
      drafts[newFile] = {
        path: newFile,
        content,
        originalContent: null,
        baseSha: null,
        status: "added",
      };
      delete originals[oldFile];
    }

    const tree = renameNodePath(s.tree, cleanOld, cleanNew);
    const tabs = s.tabs.map((t) =>
      t === cleanOld || t.startsWith(`${cleanOld}/`)
        ? cleanNew + t.slice(cleanOld.length)
        : t,
    );
    const activePath =
      s.activePath &&
      (s.activePath === cleanOld || s.activePath.startsWith(`${cleanOld}/`))
        ? cleanNew + s.activePath.slice(cleanOld.length)
        : s.activePath;

    set({ tree, drafts, originals, tabs, activePath });
    return null;
  },

  deleteFile: (path) => {
    const s = get();
    const node = findNode(s.tree, path);
    if (!node || node.type !== "file") return;

    const draft = s.drafts[path];

    if (draft?.status === "added") {
      const drafts = { ...s.drafts };
      delete drafts[path];
      set({
        drafts,
        tree: removeNode(s.tree, path),
        tabs: s.tabs.filter((t) => t !== path),
        activePath:
          s.activePath === path
            ? s.tabs.find((t) => t !== path) ?? null
            : s.activePath,
      });
      return;
    }

    const original = s.originals[path];
    if (!original) return;

    set({
      drafts: {
        ...s.drafts,
        [path]: {
          path,
          content: "",
          originalContent: original.content,
          baseSha: original.sha,
          status: "deleted",
        },
      },
      tabs: s.tabs.filter((t) => t !== path),
      activePath:
        s.activePath === path
          ? s.tabs.find((t) => t !== path) ?? null
          : s.activePath,
    });
  },

  duplicateFile: (path) => {
    const s = get();
    const draft = s.drafts[path];
    const original = s.originals[path];
    const content = draft?.content ?? original?.content ?? "";

    const dir = dirname(path);
    const name = basename(path);
    const dotIdx = name.lastIndexOf(".");
    const ext = dotIdx > 0 ? name.slice(dotIdx) : "";
    const base = dotIdx > 0 ? name.slice(0, dotIdx) : name;

    let candidate = dir ? `${dir}/${base}-copy${ext}` : `${base}-copy${ext}`;
    let counter = 2;
    while (findNode(s.tree, candidate)) {
      candidate = dir
        ? `${dir}/${base}-copy-${counter}${ext}`
        : `${base}-copy-${counter}${ext}`;
      counter += 1;
    }

    return get().addFile(candidate, content);
  },

  revertFile: (path) => {
    const s = get();
    const draft = s.drafts[path];
    if (!draft) return;

    if (draft.status === "added") {
      const drafts = { ...s.drafts };
      delete drafts[path];
      set({
        drafts,
        tree: removeNode(s.tree, path),
        tabs: s.tabs.filter((t) => t !== path),
        activePath:
          s.activePath === path
            ? s.tabs.find((t) => t !== path) ?? null
            : s.activePath,
      });
      return;
    }

    const drafts = { ...s.drafts };
    delete drafts[path];
    set({ drafts });
  },

  discardAll: () => {
    const s = get();
    set({
      drafts: {},
      tree: s.treeLoaded
        ? s.tree
        : s.tree,
      tabs: s.tabs.filter((t) => !s.drafts[t] || s.drafts[t].status !== "added"),
      activePath: s.activePath,
    });
    // Rebuild tree without added files
    const cleanTree = removeAddedNodes(s.tree, s.drafts);
    set({ tree: cleanTree });
  },

  hydrateDrafts: () => {
    const s = get();
    if (!s.session) return;
    const key = DRAFTS_KEY(s.session);
    if (s.hydratedFor === key) return;

    const stored = readJson<Record<string, FileDraft>>("local", key) ?? {};
    const valid: Record<string, FileDraft> = {};
    for (const [path, draft] of Object.entries(stored)) {
      if (
        draft &&
        typeof draft.path === "string" &&
        typeof draft.content === "string" &&
        (draft.status === "added" ||
          draft.status === "modified" ||
          draft.status === "deleted")
      ) {
        valid[path] = draft;
      }
    }

    set({
      drafts: valid,
      hydrated: true,
      hydratedFor: key,
      tree: s.treeLoaded ? mergeAddedDrafts(s.tree, valid) : s.tree,
    });
  },

  setBaseHeadSha: (sha) => set({ baseHeadSha: sha }),
  setRemoteChanged: (v) => set({ remoteChanged: v }),
  setSyncStatus: (s) => set({ syncStatus: s }),
  setRateLimitRemaining: (n) => set({ rateLimitRemaining: n }),

  updateSettings: (patch) => {
    const next = { ...get().settings, ...patch };
    writeJson("local", SETTINGS_KEY, next);
    set({ settings: next });
  },

  applyPush: (result) => {
    const s = get();
    const originals = { ...s.originals };
    let tree = s.tree;

    for (const draft of Object.values(s.drafts)) {
      if (draft.status === "deleted") {
        delete originals[draft.path];
        tree = removeNode(tree, draft.path);
      } else {
        originals[draft.path] = {
          content: draft.content,
          sha: result.blobs[draft.path] ?? originals[draft.path]?.sha ?? "",
        };
      }
    }

    const tabs = s.tabs.filter((t) => {
      const d = s.drafts[t];
      return !d || d.status !== "deleted";
    });
    const activePath = tabs.includes(s.activePath ?? "")
      ? s.activePath
      : tabs[0] ?? null;

    set({
      drafts: {},
      originals,
      tree,
      tabs,
      activePath,
      baseHeadSha: result.newHeadSha,
      remoteChanged: false,
      syncStatus: "synced",
    });
  },

  reset: () => set({ ...initialState }),
}));

function removeAddedNodes(
  tree: TreeNode[],
  drafts: Record<string, FileDraft>,
): TreeNode[] {
  let next = tree;
  for (const draft of Object.values(drafts)) {
    if (draft.status === "added") {
      next = removeNode(next, draft.path);
    }
  }
  return next;
}

if (typeof window !== "undefined") {
  let timer: number | undefined;
  useStore.subscribe((state, prev) => {
    if (state.drafts === prev.drafts) return;
    if (!state.hydrated || !state.session) return;
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      const current = useStore.getState();
      if (!current.session) return;
      try {
        window.localStorage.setItem(
          DRAFTS_KEY(current.session),
          JSON.stringify(current.drafts),
        );
      } catch {
        /* quota */
      }
    }, 400);
  });
}

export function changedCount(drafts: Record<string, FileDraft>): number {
  return Object.keys(drafts).length;
}
