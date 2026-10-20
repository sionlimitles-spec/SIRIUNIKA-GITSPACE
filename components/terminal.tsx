"use client";

import { useEffect, useRef } from "react";
import type { Terminal as XTerm } from "@xterm/xterm";
import { useStore, type FileDraft } from "@/lib/store";
import type { GithubClient } from "@/lib/github";
import { findNode, type TreeNode } from "@/lib/github";
import { basename, dirname, isBinaryPath } from "@/lib/utils";

interface TerminalProps {
  client: GithubClient;
}

const COLORS = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[90m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
};

function color(code: keyof typeof COLORS, text: string): string {
  return `${COLORS[code]}${text}${COLORS.reset}`;
}

function resolvePath(cwd: string, input: string): string {
  if (!input) return cwd;
  const raw = input.startsWith("/") ? input.slice(1) : `${cwd}/${input}`;
  const stack: string[] = [];
  for (const part of raw.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") stack.pop();
    else stack.push(part);
  }
  return stack.join("/");
}

function getDirNode(tree: TreeNode[], cwd: string): TreeNode | null {
  if (!cwd) return { name: "", path: "", type: "dir", children: tree };
  const node = findNode(tree, cwd);
  return node && node.type === "dir" ? node : null;
}

function relativePath(from: string, to: string): string {
  if (!from) return to || ".";
  if (to === from) return ".";
  if (to.startsWith(`${from}/`)) return to.slice(from.length + 1);
  return `../${to}`;
}

interface Cmd {
  name: string;
  help: string;
  run: (args: string[], ctx: Ctx) => Promise<void> | void;
}

interface Ctx {
  cwd: string;
  setCwd: (next: string) => void;
  print: (text: string) => void;
  println: (text?: string) => void;
  client: GithubClient;
  commitMessageRef: { current: string };
}

function makeCommands(): Cmd[] {
  return [
    {
      name: "help",
      help: "Show available commands",
      run: (_args, { println }) => {
        println(color("cyan", "Available commands:"));
        for (const c of COMMANDS) {
          println(`  ${c.name.padEnd(14)} ${color("dim", c.help)}`);
        }
        println();
        println(
          color(
            "yellow",
            "This is a simulated terminal. npm / python / node cannot run here.",
          ),
        );
      },
    },
    {
      name: "clear",
      help: "Clear the terminal",
      run: (_args, _ctx) => {
        // handled by caller to preserve prompt
      },
    },
    {
      name: "pwd",
      help: "Print working directory",
      run: (_args, { cwd, println }) => println(`/${cwd}`),
    },
    {
      name: "cd",
      help: "Change directory",
      run: (args, { cwd, setCwd, println, client }) => {
        const target = args[0] ?? "";
        const next = target ? resolvePath(cwd, target) : "";
        const tree = useStore.getState().tree;
        const node = getDirNode(tree, next);
        if (!node) {
          println(color("red", `cd: ${target}: no such directory`));
          return;
        }
        setCwd(next);
        void client;
      },
    },
    {
      name: "ls",
      help: "List directory contents",
      run: (args, { cwd, print, println }) => {
        const tree = useStore.getState().tree;
        const target = args[0] ? resolvePath(cwd, args[0]) : cwd;
        const node = getDirNode(tree, target);
        if (!node) {
          println(color("red", `ls: ${args[0] ?? ""}: no such directory`));
          return;
        }
        const children = node.children ?? [];
        if (children.length === 0) return;
        const line = children
          .map((c) =>
            c.type === "dir"
              ? color("blue", `${c.name}/`)
              : color("white", c.name),
          )
          .join("  ");
        print(line);
        println();
      },
    },
    {
      name: "tree",
      help: "Show directory tree",
      run: (args, { cwd, println }) => {
        const tree = useStore.getState().tree;
        const target = args[0] ? resolvePath(cwd, args[0]) : cwd;
        const node = getDirNode(tree, target);
        if (!node) {
          println(color("red", `tree: ${args[0] ?? ""}: no such directory`));
          return;
        }
        const label = target || ".";
        println(color("blue", label));
        const walk = (n: TreeNode, prefix: string) => {
          const kids = n.children ?? [];
          kids.forEach((child, i) => {
            const isLast = i === kids.length - 1;
            const branch = isLast ? "└── " : "├── ";
            const nextPrefix = prefix + (isLast ? "    " : "│   ");
            println(
              prefix +
                color("dim", branch) +
                (child.type === "dir"
                  ? color("blue", `${child.name}/`)
                  : child.name),
            );
            if (child.type === "dir") walk(child, nextPrefix);
          });
        };
        walk(node, "");
      },
    },
    {
      name: "cat",
      help: "Print file contents",
      run: async (args, { cwd, println, client }) => {
        if (!args[0]) {
          println(color("red", "cat: missing file operand"));
          return;
        }
        const tree = useStore.getState().tree;
        const store = useStore.getState();
        const target = resolvePath(cwd, args[0]);
        const node = findNode(tree, target);
        if (!node || node.type === "file") {
          if (!node) {
            println(color("red", `cat: ${args[0]}: no such file`));
            return;
          }
          if (isBinaryPath(target)) {
            println(color("red", `cat: ${args[0]}: binary file`));
            return;
          }
          let content =
            store.drafts[target]?.content ?? store.originals[target]?.content;
          if (content === undefined && node.sha) {
            try {
              const blob = await client.getBlob(node.sha);
              content = blob.text;
            } catch {
              println(color("red", `cat: ${args[0]}: failed to fetch`));
              return;
            }
          }
          println(content ?? "");
          return;
        }
        println(color("red", `cat: ${args[0]}: is a directory`));
      },
    },
    {
      name: "touch",
      help: "Create an empty file",
      run: (args, { cwd, println }) => {
        if (!args[0]) {
          println(color("red", "touch: missing file operand"));
          return;
        }
        const target = resolvePath(cwd, args[0]);
        const ok = useStore.getState().addFile(target);
        if (!ok) println(color("red", `touch: ${args[0]}: failed`));
        else println(color("green", `Created ${target}`));
      },
    },
    {
      name: "mkdir",
      help: "Create a directory",
      run: (args, { cwd, println }) => {
        if (!args[0]) {
          println(color("red", "mkdir: missing operand"));
          return;
        }
        const target = resolvePath(cwd, args[0]);
        const ok = useStore.getState().addFolder(target);
        if (!ok) println(color("red", `mkdir: ${args[0]}: failed`));
        else println(color("green", `Created ${target}/`));
      },
    },
    {
      name: "rm",
      help: "Delete a file",
      run: (args, { cwd, println }) => {
        if (!args[0]) {
          println(color("red", "rm: missing operand"));
          return;
        }
        const target = resolvePath(cwd, args[0]);
        useStore.getState().deleteFile(target);
        println(color("yellow", `Marked for deletion: ${target}`));
      },
    },
    {
      name: "mv",
      help: "Rename a file or folder",
      run: (args, { cwd, println }) => {
        if (args.length < 2) {
          println(color("red", "mv: missing operand"));
          return;
        }
        const from = resolvePath(cwd, args[0]);
        const to = resolvePath(cwd, args[1]);
        const err = useStore.getState().renameFile(from, to);
        if (err) println(color("red", `mv: ${err}`));
        else println(color("green", `Renamed ${from} → ${to}`));
      },
    },
    {
      name: "cp",
      help: "Copy a file",
      run: (args, { cwd, println }) => {
        if (args.length < 2) {
          println(color("red", "cp: missing operand"));
          return;
        }
        const from = resolvePath(cwd, args[0]);
        const to = resolvePath(cwd, args[1]);
        const store = useStore.getState();
        const content =
          store.drafts[from]?.content ?? store.originals[from]?.content;
        if (content === undefined) {
          println(color("red", `cp: ${args[0]}: not loaded`));
          return;
        }
        const ok = store.addFile(to, content);
        if (!ok) println(color("red", `cp: failed`));
        else println(color("green", `Copied to ${to}`));
      },
    },
    {
      name: "git",
      help: "git status | diff | log | branch | checkout | add | commit | push | pull",
      run: async (args, ctx) => {
        await runGit(args, ctx);
      },
    },
  ];
}

const COMMANDS = makeCommands();

async function runGit(args: string[], ctx: Ctx): Promise<void> {
  const { println, client, commitMessageRef, cwd } = ctx;
  const sub = args[0];

  if (!sub) {
    println(color("red", "git: missing subcommand"));
    return;
  }

  const store = useStore.getState();

  if (sub === "status") {
    const drafts = Object.values(store.drafts) as FileDraft[];
    if (drafts.length === 0) {
      println(color("green", "nothing to commit, working tree clean"));
      return;
    }
    println(color("cyan", "Changes not staged for commit:"));
    for (const d of drafts) {
      const tag =
        d.status === "added"
          ? color("green", "new file:")
          : d.status === "deleted"
            ? color("red", "deleted:")
            : color("yellow", "modified:");
      println(`  ${tag}   ${d.path}`);
    }
    println();
    println(
      color(
        "dim",
        "Push with the Save / Push button in the top bar to create a commit.",
      ),
    );
    return;
  }

  if (sub === "diff") {
    const drafts = Object.values(store.drafts) as FileDraft[];
    if (drafts.length === 0) {
      println(color("dim", "no changes"));
      return;
    }
    for (const d of drafts) {
      println(color("bold", `--- ${d.path}`));
      if (d.status === "deleted") {
        println(color("red", `(deleted, ${d.originalContent?.length ?? 0} bytes removed)`));
      } else if (d.status === "added") {
        println(color("green", `(new file, ${d.content.length} bytes)`));
      } else {
        const oldLines = (d.originalContent ?? "").split("\n").length;
        const newLines = d.content.split("\n").length;
        println(
          `  ${color("red", `-${oldLines} lines`)} ${color("green", `+${newLines} lines`)}`,
        );
      }
      println();
    }
    println(
      color("dim", "Full inline diff is available in the Save / Push dialog."),
    );
    return;
  }

  if (sub === "log") {
    const base = store.baseHeadSha;
    if (!base) {
      println(color("red", "no commits loaded yet"));
      return;
    }
    println(
      `${color("yellow", `commit ${base}`)}\n` +
        `Author: RepoDeck <local>\n` +
        `Date:   ${new Date().toUTCString()}\n\n` +
        `    ${color("bold", "(HEAD → current branch)")}`,
    );
    println(color("dim", "(limited history — RepoDeck does not fetch full log)"));
    return;
  }

  if (sub === "branch") {
    const list = await client.listBranches();
    const current = store.session?.branch;
    for (const b of list) {
      println(b === current ? color("green", `* ${b}`) : `  ${b}`);
    }
    return;
  }

  if (sub === "checkout") {
    const target = args[1];
    if (!target) {
      println(color("red", "git checkout <branch>"));
      return;
    }
    if (!store.session) return;
    if (Object.keys(store.drafts).length > 0) {
      println(color("red", "error: uncommitted changes — Save / Push first"));
      return;
    }
    useStore.getState().setSession({ ...store.session, branch: target });
    useStore.setState({
      drafts: {},
      originals: {},
      tabs: [],
      activePath: null,
      tree: [],
      treeLoaded: false,
      baseHeadSha: null,
      hydrated: false,
      hydratedFor: null,
    });
    println(color("green", `Switched to branch '${target}'`));
    return;
  }

  if (sub === "add") {
    println(
      color(
        "dim",
        "RepoDeck tracks all edits automatically. Use the Save / Push dialog.",
      ),
    );
    return;
  }

  if (sub === "commit") {
    const mIdx = args.indexOf("-m");
    const message = mIdx >= 0 ? args.slice(mIdx + 1).join(" ").replace(/^["']|["']$/g, "") : "";
    commitMessageRef.current = message;
    if (message) {
      println(
        color(
          "yellow",
          `Commit message staged: "${message}" — use Save / Push to create the commit.`,
        ),
      );
    } else {
      println(color("red", "usage: git commit -m \"message\""));
    }
    return;
  }

  if (sub === "push") {
    println(
      color(
        "yellow",
        "Open the Save / Push dialog in the top bar to push changes to GitHub.",
      ),
    );
    return;
  }

  if (sub === "pull") {
    println(color("dim", "Fetching latest branch head…"));
    try {
      const head = await client.getBranchHead(store.session!.branch);
      useStore.getState().setBaseHeadSha(head.sha);
      useStore.getState().setRemoteChanged(false);
      println(color("green", `Updated base to ${head.sha.slice(0, 7)}`));
      println(
        color("dim", "Reload the tree in the workspace to see the new files."),
      );
    } catch {
      println(color("red", "pull failed"));
    }
    void cwd;
    return;
  }

  println(color("red", `git: '${sub}' is not supported`));
}

export function Terminal({ client }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};

    (async () => {
      const [{ Terminal: XTermCtor }, { FitAddon }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
      ]);
  
      await import("@xterm/xterm/css/xterm.css");

      if (disposed || !containerRef.current) return;

      const term = new XTermCtor({
        fontFamily:
          "var(--font-jetbrains), ui-monospace, 'JetBrains Mono', monospace",
        fontSize: 12,
        cursorBlink: true,
        theme: {
          background: "#0d1117",
          foreground: "#e6edf3",
          cursor: "#10b981",
          selectionBackground: "#10b98155",
          black: "#0d1117",
          red: "#f85149",
          green: "#3fb950",
          yellow: "#d29922",
          blue: "#58a6ff",
          magenta: "#bc8cff",
          cyan: "#56d4dd",
          white: "#e6edf3",
        },
        allowProposedApi: true,
        scrollback: 2000,
        convertEol: true,
      });

      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(containerRef.current);
      fit.fit();

      const resize = () => {
        try {
          fit.fit();
        } catch {
          /* ignore */
        }
      };
      window.addEventListener("resize", resize);
      const observer = new ResizeObserver(resize);
      observer.observe(containerRef.current);

      termRef.current = term;

      let cwd = "";
      const history: string[] = [];
      let historyIndex = -1;
      let buffer = "";
      const commitMessageRef = { current: "" };

      const prompt = () => `\x1b[32m${color("green", "repodeck")}\x1b[0m ${color("blue", `/${cwd}`)} $ `;

      const writePrompt = () => {
        term.write("\r\n" + prompt());
      };

      const print = (text: string) => term.write(text);
      const println = (text?: string) => term.write((text ?? "") + "\r\n");

      const redrawLine = () => {
        term.write("\r\x1b[K" + prompt() + buffer);
      };

      const runCommand = async (line: string) => {
        const trimmed = line.trim();
        if (!trimmed) {
          writePrompt();
          return;
        }
        history.push(trimmed);
        if (history.length > 100) history.shift();
        historyIndex = history.length;

        const tokens = tokenize(trimmed);
        const [name, ...args] = tokens;

        if (name === "clear") {
          term.clear();
          term.write(prompt());
          return;
        }

        const cmd = COMMANDS.find((c) => c.name === name);
        const ctx: Ctx = {
          cwd,
          setCwd: (next) => {
            cwd = next;
          },
          print,
          println,
          client,
          commitMessageRef,
        };

        if (!cmd) {
          println(color("red", `${name}: command not found. Type 'help'.`));
          writePrompt();
          return;
        }

        try {
          await cmd.run(args, ctx);
        } catch (err) {
          println(
            color(
              "red",
              `error: ${err instanceof Error ? err.message : "unknown"}`,
            ),
          );
        }
        writePrompt();
      };

      const tabComplete = () => {
        const parts = buffer.split(/\s+/);
        const prefix = parts.pop() ?? "";
        const tree = useStore.getState().tree;
        const base = resolvePath(cwd, prefix);

        // complete commands if it's the first word
        if (parts.length === 0) {
          const matches = COMMANDS.map((c) => c.name).filter((c) =>
            c.startsWith(prefix),
          );
          if (matches.length === 1) {
            buffer = matches[0] + " ";
            redrawLine();
          } else if (matches.length > 1) {
            println();
            println(matches.join("  "));
            redrawLine();
          }
          return;
        }

        // complete paths
        const parent = dirname(prefix);
        const baseName = basename(prefix);
        const targetDir = resolvePath(cwd, parent);
        const dir = getDirNode(tree, targetDir);
        const children = dir?.children ?? [];
        const matches = children
          .filter((c) => c.name.startsWith(baseName))
          .map((c) => (c.type === "dir" ? `${c.name}/` : c.name));

        if (matches.length === 1) {
          const completed = parent ? `${parent}/${matches[0]}` : matches[0];
          buffer = parts.join(" ") + " " + completed;
          redrawLine();
        } else if (matches.length > 1) {
          println();
          println(matches.join("  "));
          redrawLine();
        }
        void base;
      };

      term.onData((data) => {
        for (let i = 0; i < data.length; i += 1) {
          const ch = data[i];

          if (ch === "\r") {
            term.write("\r\n");
            const line = buffer;
            buffer = "";
            void runCommand(line);
            continue;
          }

          if (ch === "\x7f") {
            if (buffer.length > 0) {
              buffer = buffer.slice(0, -1);
              redrawLine();
            }
            continue;
          }

          if (ch === "\t") {
            tabComplete();
            continue;
          }

          if (ch === "\x03") {
            println("^C");
            buffer = "";
            writePrompt();
            continue;
          }

          // arrow up / down
          if (ch === "\x1b") {
            // possibly escape sequence; look ahead
            if (data[i + 1] === "[" && data[i + 2] === "A") {
              i += 2;
              if (historyIndex > 0) {
                historyIndex -= 1;
                buffer = history[historyIndex] ?? "";
                redrawLine();
              }
              continue;
            }
            if (data[i + 1] === "[" && data[i + 2] === "B") {
              i += 2;
              if (historyIndex < history.length - 1) {
                historyIndex += 1;
                buffer = history[historyIndex] ?? "";
              } else {
                historyIndex = history.length;
                buffer = "";
              }
              redrawLine();
              continue;
            }
            // swallow other escape sequences
            i += 1;
            continue;
          }

          if (ch < " ") continue;

          buffer += ch;
          term.write(ch);
        }
      });

      // banner
      println(color("bold", "RepoDeck simulated terminal"));
      println(
        color(
          "yellow",
          "This is a local simulation. It cannot run npm, node, or python.",
        ),
      );
      println(color("dim", "Type 'help' for commands."));
      term.write(prompt());

      cleanup = () => {
        window.removeEventListener("resize", resize);
        observer.disconnect();
        term.dispose();
      };
    })();

    return () => {
      disposed = true;
      cleanup();
    };
  }, [client]);

  return (
    <div className="flex h-full flex-col bg-[#0d1117]">
      <div className="flex h-7 shrink-0 items-center gap-2 border-b border-border bg-muted/30 px-2 text-[11px] text-muted-foreground">
        <span className="size-1.5 rounded-full bg-emerald-500" />
        simulated terminal · cannot run npm / python / node
      </div>
      <div ref={containerRef} className="flex-1 min-h-0 p-2" />
    </div>
  );
}

function tokenize(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === " ") {
      if (current) {
        out.push(current);
        current = "";
      }
      continue;
    }
    current += ch;
  }
  if (current) out.push(current);
  return out;
        }
