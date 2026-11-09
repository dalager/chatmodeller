'use client';

import { useEffect, useState } from 'react';
import { formSchema, type FormDefinition } from '@/lib/form-schema';

/** The form definition as editable JSON. Valid edits are applied immediately. */
export function JsonEditor({
  form,
  onChange,
}: {
  form: FormDefinition;
  onChange: (form: FormDefinition) => void;
}) {
  const canonical = JSON.stringify(form, null, 2);
  const [text, setText] = useState(canonical);
  const [problem, setProblem] = useState<string | null>(null);

  // follow changes made elsewhere (the assistant), unless they match our own edit
  useEffect(() => {
    setText(current => {
      try {
        if (JSON.stringify(JSON.parse(current), null, 2) === canonical) return current;
      } catch {
        // fall through and replace the invalid draft
      }
      return canonical;
    });
    setProblem(null);
  }, [canonical]);

  const edit = (next: string) => {
    setText(next);
    let json: unknown;
    try {
      json = JSON.parse(next);
    } catch (e) {
      setProblem(`Not valid JSON: ${(e as Error).message}`);
      return;
    }
    const parsed = formSchema.safeParse(json);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setProblem(`${issue.path.join('.') || 'form'}: ${issue.message}`);
      return;
    }
    const ids = parsed.data.elements.map(e => e.id);
    const duplicate = ids.find((id, i) => ids.indexOf(id) !== i);
    if (duplicate) {
      setProblem(`Duplicate id "${duplicate}"`);
      return;
    }
    setProblem(null);
    onChange(parsed.data);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <textarea
        value={text}
        onChange={e => edit(e.target.value)}
        spellCheck={false}
        aria-label="Form definition as JSON"
        className="min-h-0 flex-1 resize-none bg-transparent p-5 font-mono text-[13px] leading-relaxed outline-none"
      />
      <p
        className={`shrink-0 border-t border-line px-5 py-2 text-xs ${
          problem ? 'bg-danger-soft text-danger' : 'text-muted'
        }`}
      >
        {problem ?? 'Edits that match the schema are applied to the form as you type.'}
      </p>
    </div>
  );
}
