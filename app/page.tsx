'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Chat } from '@/components/Chat';
import { FormRenderer } from '@/components/FormRenderer';
import { JsonEditor } from '@/components/JsonEditor';
import { emptyForm, formJsonSchema, formSchema, type FormDefinition } from '@/lib/form-schema';

const STORAGE_KEY = 'chatmodeller.form';
const TABS = ['Preview', 'Definition', 'Schema'] as const;
type Tab = (typeof TABS)[number];

export default function Page() {
  const [form, setForm] = useState<FormDefinition>(emptyForm);
  const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('Preview');

  // The form lives in the browser and survives a reload.
  useEffect(() => {
    try {
      const saved = formSchema.safeParse(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'));
      if (saved.success) setForm(saved.data);
    } catch {
      // nothing saved, or storage unavailable
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(form));
    } catch {
      // storage unavailable — the form just won't persist
    }
  }, [form, loaded]);

  const changeForm = useCallback((next: FormDefinition) => setForm(next), []);
  const selected = form.elements.some(e => e.id === selectedId) ? selectedId : null;
  const schemaText = useMemo(() => JSON.stringify(formJsonSchema(), null, 2), []);
  const isEmpty = !form.title && !form.description && form.elements.length === 0;

  return (
    <div className="flex h-full min-w-[900px]">
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-4 border-b border-line px-5">
          <span className="text-sm font-semibold">Chatmodeller</span>
          <div role="tablist" aria-label="View" className="flex gap-1">
            {TABS.map(t => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={`rounded-md px-2.5 py-1 text-sm transition ${
                  tab === t ? 'bg-ink text-white' : 'text-muted hover:bg-line/50 hover:text-ink'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <Link
            href="/architecture"
            className="ml-auto rounded px-2 py-1 text-xs text-muted hover:bg-line/50 hover:text-ink"
          >
            How it works
          </Link>
          <span className="text-xs tabular-nums text-faint">
            {form.elements.length} element{form.elements.length === 1 ? '' : 's'}
          </span>
          <button
            type="button"
            disabled={isEmpty}
            onClick={() => {
              if (confirm('Clear the whole form?')) {
                setForm(emptyForm);
                setSelectedId(null);
              }
            }}
            className="rounded px-2 py-1 text-xs text-muted hover:bg-line/50 hover:text-ink disabled:opacity-40"
          >
            Clear form
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {tab === 'Preview' && (
            <div className="mx-auto max-w-[720px] px-6 py-10">
              {isEmpty ? (
                <div className="rounded-xl border border-dashed border-line px-8 py-20 text-center">
                  <p className="text-lg font-medium">No form yet</p>
                  <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">
                    Tell the assistant on the right what you need — for example “a contact form
                    with name, email and a message”.
                  </p>
                </div>
              ) : (
                <div className="rounded-xl bg-sheet px-7 py-8 shadow-[0_1px_2px_rgb(0_0_0/0.05),0_8px_24px_-12px_rgb(0_0_0/0.12)]">
                  <FormRenderer form={form} selectedId={selected} onSelect={setSelectedId} />
                </div>
              )}
            </div>
          )}
          {tab === 'Definition' && (
            <div className="h-full bg-sheet">
              <JsonEditor form={form} onChange={changeForm} />
            </div>
          )}
          {tab === 'Schema' && (
            <div className="bg-sheet">
              <p className="border-b border-line px-5 py-2 text-xs text-muted">
                JSON Schema for a form definition. Also served at{' '}
                <a href="/api/schema" target="_blank" className="font-mono underline">
                  /api/schema
                </a>
                .
              </p>
              <pre className="overflow-x-auto p-5 font-mono text-[13px] leading-relaxed">
                {schemaText}
              </pre>
            </div>
          )}
        </div>
      </main>

      <aside className="w-[400px] shrink-0 border-l border-line bg-sheet">
        <Chat
          form={form}
          selectedId={selected}
          onFormChange={changeForm}
          onClearSelection={() => setSelectedId(null)}
        />
      </aside>
    </div>
  );
}
