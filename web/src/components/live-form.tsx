"use client";

import { AlertTriangle, Terminal } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import type { FieldSnapshot, FormSnapshot, PageSnapshot, TableSnapshot } from "@/lib/runtime/page";
import type { LivePage } from "@/lib/router/types";
import { describeError } from "@/lib/session";
import { toast } from "@/lib/toast";
import { Button, Card, ConfirmDialog, cn, Input, Notice, PasswordInput, Switch } from "./ui";

const DANGER = /reboot|restart|reset|delete|remove|restore|upgrade|factory|default|clear/i;
const INPUT_TYPES = new Set(["text", "password", "number", "email", "tel", "url", "search"]);
const BUTTON_TYPES = new Set(["submit", "button", "image"]);

function prettify(s: string) {
  return s.replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^\w/, (c) => c.toUpperCase()).trim();
}

/** Tables that are lists/status (not the layout grid of a form). */
function dataTables(snap: PageSnapshot) {
  return snap.tables.filter((t) => {
    const rows = t.rows.filter((r) => r.visible !== false);
    if (rows.length < 1) return false;
    const layout = rows.some((r) => r.inputs.some((i) => INPUT_TYPES.has(i.type) || i.type === "select-one" || i.type === "radio" || BUTTON_TYPES.has(i.type)));
    return !layout && rows.some((r) => r.cells.filter(Boolean).length >= 2);
  });
}

function KeyValueTable({ t }: { t: TableSnapshot }) {
  return (
    <dl className="divide-y divide-[var(--border)]">
      {t.rows
        .filter((r) => r.cells.some(Boolean))
        .map((r, i) =>
          r.cells.length === 1 ? (
            <div key={i} className="py-2 text-[13px] font-semibold">
              {r.cells[0]}
            </div>
          ) : (
            <div key={i} className="flex items-start justify-between gap-6 py-2.5 text-[13.5px]">
              <dt className="text-muted">{r.cells[0].replace(/:$/, "")}</dt>
              <dd className="text-right font-medium [overflow-wrap:anywhere]">{r.cells.slice(1).join(" · ")}</dd>
            </div>
          ),
        )}
    </dl>
  );
}

function ListTable({ t, selectable, checked, onToggle }: { t: TableSnapshot; selectable: boolean; checked: Record<string, boolean>; onToggle: (name: string, v: boolean) => void }) {
  const rows = t.rows.filter((r) => r.cells.some(Boolean) || r.inputs.length);
  const header = rows[0]?.header || (rows[0] && !rows[0].inputs.length && rows.length > 1) ? rows[0] : null;
  const body = header ? rows.slice(1) : rows;
  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full min-w-[420px] text-left text-[13px]">
        {header && (
          <thead>
            <tr className="text-[12px] text-muted">
              {header.cells.map((c, i) => (
                <th key={i} className="px-2.5 py-2 font-medium">
                  {selectable && /^select$/i.test(c) ? "" : c}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {body.length === 0 && (
            <tr>
              <td className="px-2.5 py-4 text-center text-muted" colSpan={header?.cells.length ?? 1}>
                Empty
              </td>
            </tr>
          )}
          {body.map((r, i) => {
            const box = r.inputs.find((x) => x.type === "checkbox" && x.name);
            return (
              <tr key={i} className="border-t border-subtle">
                {r.cells.map((c, j) => (
                  <td key={j} className="px-2.5 py-2 align-middle [overflow-wrap:anywhere]">
                    {j === 0 && box && selectable ? (
                      <input type="checkbox" className="size-4 accent-[var(--color-brand-600)]" checked={checked[box.name] ?? box.checked} onChange={(e) => onToggle(box.name, e.target.checked)} aria-label="Select row" />
                    ) : (
                      c
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FieldControl({ f, radios, onCommit, onDraft, draft }: { f: FieldSnapshot; radios?: FieldSnapshot[]; onCommit: (v: string | boolean) => void; onDraft: (v: string) => void; draft?: string }) {
  if (radios) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {radios.map((r) => (
          <button
            key={r.value}
            type="button"
            disabled={r.disabled}
            onClick={() => !r.checked && onCommit(r.value)}
            className={cn(
              "rounded-xl border px-3 py-1.5 text-[13px] font-medium transition disabled:opacity-50",
              r.checked ? "border-brand-400 bg-brand-50 text-brand-700 dark:border-brand-400/50 dark:bg-brand-500/15 dark:text-brand-200" : "border-subtle hover:bg-[var(--surface-2)]",
            )}
          >
            {r.label || r.value}
          </button>
        ))}
      </div>
    );
  }
  if (f.type === "checkbox") return <Switch checked={!!f.checked} disabled={f.disabled} onChange={(v) => onCommit(v)} label={f.group || f.label || f.name} />;
  if (f.options) {
    return (
      <select
        value={f.value}
        disabled={f.disabled}
        onChange={(e) => onCommit(e.target.value)}
        className="h-11 w-full rounded-xl border border-subtle surface px-3 text-[14px] shadow-card outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-500/15 disabled:opacity-60"
      >
        {f.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label || o.value}
          </option>
        ))}
      </select>
    );
  }
  const Comp = f.type === "password" ? PasswordInput : Input;
  return (
    <Comp
      value={draft ?? f.value}
      disabled={f.disabled}
      readOnly={f.readOnly}
      maxLength={f.maxLength}
      onChange={(e) => onDraft(e.target.value)}
      onBlur={(e) => e.target.value !== f.value && onCommit(e.target.value)}
      spellCheck={false}
      autoComplete="off"
    />
  );
}

function FormCard({ form, live, snap, setSnap, tables }: { form: FormSnapshot; live: LivePage; snap: PageSnapshot; setSnap: (s: PageSnapshot) => void; tables: TableSnapshot[] }) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ name: string; label: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const pending = useRef<Record<string, string | boolean>>({});

  const tableNames = new Set(tables.flatMap((t) => t.rows.flatMap((r) => r.inputs.map((i) => i.name))));
  const visible = form.fields.filter((f) => f.visible && f.name && f.type !== "hidden" && !BUTTON_TYPES.has(f.type) && f.type !== "reset" && f.type !== "file" && !tableNames.has(f.name));
  const hasFile = form.fields.some((f) => f.type === "file" && f.visible);
  const buttons = form.fields.filter((f) => f.visible && (BUTTON_TYPES.has(f.type) || f.type === "button") && (f.text || f.name));

  // radio groups collapse into one control
  const rows: { key: string; label: string; f: FieldSnapshot; radios?: FieldSnapshot[] }[] = [];
  const seen = new Set<string>();
  for (const f of visible) {
    if (f.type === "radio") {
      if (seen.has(f.name)) continue;
      seen.add(f.name);
      const radios = visible.filter((x) => x.type === "radio" && x.name === f.name);
      rows.push({ key: f.name, label: f.group || prettify(f.name), f, radios });
    } else rows.push({ key: f.name + f.id, label: f.group || f.label || prettify(f.name), f });
  }

  if (!rows.length && !buttons.length && !tables.length) return null;

  async function commit(name: string, value: string | boolean) {
    try {
      setSnap(await live.fill(form.index, { [name]: value }));
      setDrafts((d) => {
        const n = { ...d };
        delete n[name];
        return n;
      });
      delete pending.current[name];
    } catch (e) {
      toast.error(describeError(e));
    }
  }

  async function press(btn: { name: string; label: string }) {
    setBusy(btn.name);
    setMessage(null);
    const id = toast.loading(`${btn.label}…`);
    try {
      const draftEntries = Object.entries(drafts);
      const values: Record<string, string | boolean> = { ...Object.fromEntries(draftEntries), ...checks };
      if (Object.keys(values).length) await live.fill(form.index, values);
      const r = await live.press(form.index, btn.name);
      setSnap(r.snapshot);
      setDrafts({});
      setChecks({});
      toast.dismiss(id);
      if (r.message) setMessage(r.message);
      toast.success("Done. The router accepted the change.");
    } catch (e) {
      toast.dismiss(id);
      toast.error(describeError(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="p-5 sm:p-6">
      {rows.length > 0 && (
        <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          {rows.map((r) => (
            <div key={r.key} className={cn("space-y-1.5", (r.radios && r.radios.length > 3) || r.f.type === "checkbox" ? "sm:col-span-2" : "")}>
              {r.f.type === "checkbox" ? (
                <div className="flex items-center justify-between gap-4 rounded-xl bg-[var(--surface-2)] px-3.5 py-2.5">
                  <span className="text-[13.5px] font-medium">{r.label}</span>
                  <FieldControl f={r.f} onCommit={(v) => commit(r.f.name, v)} onDraft={() => undefined} />
                </div>
              ) : (
                <>
                  <label className="block text-[13px] font-medium">{r.label}</label>
                  <FieldControl
                    f={r.f}
                    radios={r.radios}
                    draft={drafts[r.f.name]}
                    onDraft={(v) => {
                      pending.current[r.f.name] = v;
                      setDrafts((d) => ({ ...d, [r.f.name]: v }));
                    }}
                    onCommit={(v) => commit(r.f.name, v)}
                  />
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {tables.map((t) => (
        <div key={t.index} className={cn(rows.length && "mt-5")}>
          <ListTable t={t} selectable checked={checks} onToggle={(n, v) => setChecks((c) => ({ ...c, [n]: v }))} />
        </div>
      ))}

      {hasFile && (
        <Notice tone="amber" icon={<AlertTriangle />} className="mt-4">
          This page needs a file upload. Use the router&apos;s classic page for it.
        </Notice>
      )}

      {buttons.length > 0 && (
        <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-subtle pt-4">
          {buttons.map((b, i) => {
            const label = b.text || prettify(b.name);
            const danger = DANGER.test(label);
            return (
              <Button
                key={b.name + i}
                variant={danger ? "soft-danger" : i === buttons.length - 1 || /apply|save|add/i.test(label) ? "primary" : "secondary"}
                size="sm"
                loading={busy === (b.name || label)}
                disabled={!!busy || b.disabled}
                onClick={() => (danger ? setConfirm({ name: b.name || label, label }) : press({ name: b.name || label, label }))}
              >
                {label}
              </Button>
            );
          })}
        </div>
      )}

      {message && (
        <div className="mt-4 rounded-xl bg-zinc-950 p-4 text-zinc-100 dark:bg-black/40">
          <p className="mb-2 flex items-center gap-1.5 text-[12px] font-medium text-zinc-400">
            <Terminal className="size-3.5" /> Router response
          </p>
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap font-mono text-[12.5px] leading-relaxed">{message}</pre>
        </div>
      )}

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          const c = confirm!;
          setConfirm(null);
          void press(c);
        }}
        tone="danger"
        title={`${confirm?.label}?`}
        description="This changes your router right away. Make sure this is what you want."
        confirmLabel={confirm?.label ?? "Continue"}
      />
    </Card>
  );
}

export function LiveForm({ live }: { live: LivePage }) {
  const [snap, setSnap] = useState<PageSnapshot>(live.snapshot);
  const tables = useMemo(() => dataTables(snap), [snap]);

  // Assign selectable list tables to the form that owns their checkboxes.
  const owned = new Map<number, TableSnapshot[]>();
  const info: TableSnapshot[] = [];
  for (const t of tables) {
    const names = t.rows.flatMap((r) => r.inputs.filter((i) => i.type === "checkbox").map((i) => i.name));
    const form = names.length ? snap.forms.find((f) => f.fields.some((x) => names.includes(x.name))) : undefined;
    if (form) owned.set(form.index, [...(owned.get(form.index) ?? []), t]);
    else info.push(t);
  }
  // A form whose list is empty still owns the header-only table right after it.
  for (const t of info.slice()) {
    if (/^select$/i.test(t.rows[0]?.cells[0] ?? "")) {
      const form = snap.forms.find((f) => f.fields.some((x) => /delete|del/i.test(x.name)));
      if (form) {
        owned.set(form.index, [...(owned.get(form.index) ?? []), t]);
        info.splice(info.indexOf(t), 1);
      }
    }
  }

  return (
    <div className="space-y-4">
      {snap.alerts.length > 0 && <Notice tone="amber">{snap.alerts.join(" ")}</Notice>}
      {info.map((t) =>
        t.rows.every((r) => r.cells.length <= 2) ? (
          <Card key={t.index} className="px-5 py-2 sm:px-6">
            <KeyValueTable t={t} />
          </Card>
        ) : (
          <Card key={t.index} className="p-4 sm:p-5">
            <ListTable t={t} selectable={false} checked={{}} onToggle={() => undefined} />
          </Card>
        ),
      )}
      {snap.forms.map((f) => (
        <FormCard key={f.index} form={f} live={live} snap={snap} setSnap={setSnap} tables={owned.get(f.index) ?? []} />
      ))}
    </div>
  );
}
