"use client";

import { Label } from "@/components/ui/label";
import { useStore } from "@/lib/store";

export function SettingsPanel() {
  const settings = useStore((s) => s.settings);
  const update = useStore((s) => s.updateSettings);
  const session = useStore((s) => s.session);
  const setSession = useStore((s) => s.setSession);

  return (
    <div className="flex h-full flex-col overflow-auto bg-sidebar">
      <div className="border-b border-border px-3 py-1.5 text-xs font-medium">
        Settings
      </div>

      <div className="space-y-4 p-3 text-xs">
        <div>
          <Label className="mb-1 block text-[11px] text-muted-foreground">
            Font size ({settings.fontSize}px)
          </Label>
          <input
            type="range"
            min={11}
            max={20}
            step={1}
            value={settings.fontSize}
            onChange={(e) => update({ fontSize: Number(e.target.value) })}
            className="w-full accent-emerald-500"
          />
        </div>

        <div>
          <Label className="mb-1 block text-[11px] text-muted-foreground">
            Tab size
          </Label>
          <select
            value={settings.tabSize}
            onChange={(e) => update({ tabSize: Number(e.target.value) })}
            className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
          >
            <option value={2}>2 spaces</option>
            <option value={4}>4 spaces</option>
            <option value={8}>8 spaces</option>
          </select>
        </div>

        <div>
          <Label className="mb-1 block text-[11px] text-muted-foreground">
            Word wrap
          </Label>
          <select
            value={settings.wordWrap}
            onChange={(e) =>
              update({ wordWrap: e.target.value as "on" | "off" })
            }
            className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
          >
            <option value="on">On</option>
            <option value="off">Off</option>
          </select>
        </div>

        <label className="flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">Minimap</span>
          <input
            type="checkbox"
            checked={settings.minimap}
            onChange={(e) => update({ minimap: e.target.checked })}
            className="size-3.5 accent-emerald-500"
          />
        </label>

        <div className="border-t border-border pt-3">
          <div className="text-[11px] text-muted-foreground">Session</div>
          <div className="mt-1 font-mono text-[11px]">
            {session ? `${session.owner}/${session.repo}@${session.branch}` : "—"}
          </div>
          <button
            type="button"
            onClick={() => {
              setSession(null);
              window.location.href = "/";
            }}
            className="mt-2 w-full rounded-md border border-destructive/40 px-2 py-1 text-[11px] text-destructive hover:bg-destructive/10"
          >
            Disconnect
          </button>
        </div>
      </div>
    </div>
  );
}
