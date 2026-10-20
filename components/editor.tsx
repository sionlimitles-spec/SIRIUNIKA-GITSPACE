"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import {
  Code2,
  Eye,
  FileWarning,
  Loader2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useStore } from "@/lib/store";
import { findNode, type GithubClient } from "@/lib/github";
import {
  basename,
  cn,
  detectLanguage,
  extname,
  getMimeType,
  isBinaryPath,
  isImagePath,
} from "@/lib/utils";

const MonacoEditor = dynamic(
  () => import("@monaco-editor/react").then((m) => m.default),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        <Loader2 className="size-3.5 mr-2 animate-spin" />
        Loading editor…
      </div>
    ),
  },
);

interface EditorProps {
  client: GithubClient;
}

export function Editor({ client }: EditorProps) {
  const tabs = useStore((s) => s.tabs);
  const activePath = useStore((s) => s.activePath);
  const setActive = useStore((s) => s.setActive);
  const closeTab = useStore((s) => s.closeTab);
  const drafts = useStore((s) => s.drafts);

  if (tabs.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex h-9 shrink-0 items-stretch overflow-x-auto border-b border-border bg-muted/30 scrollbar-thin">
        {tabs.map((tab) => {
          const isActive = activePath === tab;
          const isDirty = Boolean(drafts[tab]);
          return (
            <div
              key={tab}
              className={cn(
                "group flex shrink-0 items-center gap-1 border-r border-border px-2 text-xs transition-colors",
                isActive
                  ? "bg-background text-foreground"
                  : "text-muted-foreground hover:bg-accent/40",
              )}
            >
              <button
                type="button"
                onClick={() => setActive(tab)}
                className="flex items-center gap-1.5 truncate max-w-[200px]"
                title={tab}
              >
                <span className="truncate">{basename(tab)}</span>
                {isDirty && (
                  <span className="size-1.5 shrink-0 rounded-full bg-primary" />
                )}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab);
                }}
                className="rounded p-0.5 opacity-0 hover:bg-accent group-hover:opacity-100"
                aria-label={`Close ${tab}`}
              >
                <X className="size-3" />
              </button>
            </div>
          );
        })}
      </div>

      <div className="flex-1 min-h-0">
        {activePath && (
          <EditorTabContent key={activePath} path={activePath} client={client} />
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full items-center justify-center bg-muted/10">
      <div className="text-center text-xs text-muted-foreground">
        <FileWarning className="mx-auto mb-2 size-8 opacity-40" />
        <p className="font-mono">No file open</p>
        <p className="mt-1">
          Pick a file from the tree, or press <kbd>Ctrl</kbd>+
          <kbd>P</kbd> to quick-open.
        </p>
      </div>
    </div>
  );
}

function EditorTabContent({
  path,
  client,
}: {
  path: string;
  client: GithubClient;
}) {
  const original = useStore((s) => s.originals[path]);
  const draft = useStore((s) => s.drafts[path]);
  const registerOriginal = useStore((s) => s.registerOriginal);
  const updateContent = useStore((s) => s.updateContent);
  const tree = useStore((s) => s.tree);
  const node = findNode(tree, path);
  const sha = node?.sha;

  const blobQuery = useQuery({
    queryKey: ["blob", client.owner, client.repo, sha],
    queryFn: () => client.getBlob(sha!),
    enabled: Boolean(sha && !original),
    staleTime: Infinity,
  });

  useEffect(() => {
    if (blobQuery.data && sha) {
      registerOriginal(path, blobQuery.data.text, sha);
    }
  }, [blobQuery.data, sha, path, registerOriginal]);

  const content = draft?.content ?? original?.content ?? "";

  if (blobQuery.isLoading && !original) {
    return <EditorSkeleton />;
  }

  if (blobQuery.isError) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-xs text-destructive">
        <div>
          <FileWarning className="mx-auto mb-2 size-6" />
          <p>Could not load this file from GitHub.</p>
        </div>
      </div>
    );
  }

  if (isBinaryPath(path)) {
    if (isImagePath(path) && blobQuery.data) {
      return <ImagePreview path={path} base64={blobQuery.data.base64} />;
    }
    return <BinaryPlaceholder path={path} />;
  }

  return (
    <TextEditor
      path={path}
      content={content}
      onChange={(next) => updateContent(path, next)}
    />
  );
}

function EditorSkeleton() {
  return (
    <div className="p-6 space-y-2">
      {Array.from({ length: 12 }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-3.5 rounded"
          style={{ width: `${40 + ((i * 17) % 60)}%` }}
        />
      ))}
    </div>
  );
}

function ImagePreview({ path, base64 }: { path: string; base64: string }) {
  const mime = getMimeType(path);
  const src = `data:${mime};base64,${base64}`;
  return (
    <div className="flex h-full items-center justify-center bg-muted/20 p-6">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={basename(path)}
        className="max-h-full max-w-full rounded-lg border border-border object-contain"
      />
    </div>
  );
}

function BinaryPlaceholder({ path }: { path: string }) {
  return (
    <div className="flex h-full items-center justify-center px-6 text-center text-xs text-muted-foreground">
      <div>
        <FileWarning className="mx-auto mb-2 size-8 opacity-60" />
        <p className="font-mono">{basename(path)}</p>
        <p className="mt-1">
          Binary file — preview not available.
        </p>
      </div>
    </div>
  );
}

function TextEditor({
  path,
  content,
  onChange,
}: {
  path: string;
  content: string;
  onChange: (value: string) => void;
}) {
  const ext = extname(path);
  const isMarkdown = ext === "md" || ext === "mdx";
  const isHtml = ext === "html" || ext === "htm";
  const supportsPreview = isMarkdown || isHtml;
  const [view, setView] = useState<"code" | "preview">("code");

  useEffect(() => {
    // switching files should reset preview state
    setView("code");
  }, [path]);

  const { resolvedTheme } = useTheme();
  const monacoTheme = resolvedTheme === "light" ? "vs" : "vs-dark";

  return (
    <div className="flex h-full flex-col">
      {supportsPreview && (
        <div className="flex shrink-0 items-center justify-end gap-1 border-b border-border px-2 py-1">
          <Button
            size="sm"
            variant={view === "code" ? "secondary" : "ghost"}
            className="h-6 px-2 text-xs"
            onClick={() => setView("code")}
          >
            <Code2 className="size-3" />
            Code
          </Button>
          <Button
            size="sm"
            variant={view === "preview" ? "secondary" : "ghost"}
            className="h-6 px-2 text-xs"
            onClick={() => setView("preview")}
          >
            <Eye className="size-3" />
            Preview
          </Button>
        </div>
      )}
      <div className="flex-1 min-h-0">
        {view === "code" ? (
          <MonacoEditor
            key={path}
            language={detectLanguage(path)}
            value={content}
            onChange={(v) => onChange(v ?? "")}
            theme={monacoTheme}
            options={{
              fontSize: 13,
              fontFamily: "var(--font-jetbrains), ui-monospace, monospace",
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 2,
              wordWrap: "on",
              renderLineHighlight: "line",
              smoothScrolling: true,
              padding: { top: 8, bottom: 8 },
            }}
          />
        ) : isMarkdown ? (
          <MarkdownPreview content={content} />
        ) : (
          <HtmlPreview content={content} />
        )}
      </div>
    </div>
  );
}

/** Minimal safe markdown renderer: escape first, then apply inline replacements. */
function renderMarkdown(md: string): string {
  const escaped = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const blocks = escaped.split(/\n{2,}/);
  return blocks
    .map((block) => {
      const trimmed = block.trimEnd();
      if (/^### /.test(trimmed)) {
        return `<h3 class="mt-4 mb-1 text-sm font-semibold">${trimmed.slice(4)}</h3>`;
      }
      if (/^## /.test(trimmed)) {
        return `<h2 class="mt-4 mb-1 text-base font-semibold">${trimmed.slice(3)}</h2>`;
      }
      if (/^# /.test(trimmed)) {
        return `<h1 class="mt-4 mb-2 text-lg font-semibold">${trimmed.slice(2)}</h1>`;
      }
      if (/^- /.test(trimmed) || /^\* /.test(trimmed)) {
        const items = trimmed
          .split(/\n/)
          .map((line) =>
            line
              .replace(/^[-*]\s+/, "")
              .replace(/`([^`]+)`/g, '<code class="rounded bg-muted px-1 py-0.5 text-[11px]">$1</code>')
              .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
              .replace(/\*([^*]+)\*/g, "<em>$1</em>"),
          )
          .map((li) => `<li>${li}</li>`)
          .join("");
        return `<ul class="ml-4 list-disc space-y-0.5">${items}</ul>`;
      }
      return `<p class="my-2 leading-6">${trimmed
        .replace(/`([^`]+)`/g, '<code class="rounded bg-muted px-1 py-0.5 text-[11px]">$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/\*([^*]+)\*/g, "<em>$1</em>")
        .replace(/\n/g, "<br />")}</p>`;
    })
    .join("");
}

function MarkdownPreview({ content }: { content: string }) {
  const html = useMemo(() => renderMarkdown(content), [content]);
  return (
    <div className="h-full overflow-auto px-6 py-4 text-sm">
      <div
        dangerouslySetInnerHTML={{ __html: html }}
        className="prose-styles max-w-none"
      />
    </div>
  );
}

function HtmlPreview({ content }: { content: string }) {
  return (
    <iframe
      title="HTML preview"
      sandbox="allow-scripts"
      srcDoc={content}
      className="h-full w-full border-0 bg-white"
    />
  );
}
