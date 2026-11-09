'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { isInput, type FormDefinition, type FormElement } from '@/lib/form-schema';
import { validateElement, validateForm, type FormErrors, type FormValues } from '@/lib/validate';

type InputElement = Extract<FormElement, { label: string }>;

const control =
  'w-full rounded-md border border-line bg-white px-3 py-2 text-[15px] text-ink placeholder:text-faint outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20 aria-[invalid=true]:border-danger';

/** Ids of elements that are new or different compared to the previous render. */
function useChangedIds(form: FormDefinition) {
  const previous = useRef<Map<string, string> | null>(null);
  const [changed, setChanged] = useState<Set<string>>(new Set());

  useEffect(() => {
    const current = new Map(form.elements.map(e => [e.id, JSON.stringify(e)]));
    const before = previous.current;
    previous.current = current;
    if (!before) return; // first render: nothing to highlight
    const ids = [...current].filter(([id, json]) => before.get(id) !== json).map(([id]) => id);
    if (!ids.length) return;
    setChanged(new Set(ids));
    document
      .getElementById(`el-${ids[0]}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    const timer = setTimeout(() => setChanged(new Set()), 1800);
    return () => clearTimeout(timer);
  }, [form.elements]);

  return changed;
}

export function FormRenderer({
  form,
  selectedId,
  onSelect,
}: {
  form: FormDefinition;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const [values, setValues] = useState<FormValues>({});
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState<string | null>(null);
  const changed = useChangedIds(form);

  const setValue = (el: FormElement, value: unknown) => {
    setValues(v => ({ ...v, [el.id]: value }));
    setSubmitted(null);
    // once a field has shown an error, re-check it as the user types
    if (errors[el.id]) {
      const error = validateElement(el, value);
      setErrors(({ [el.id]: _removed, ...rest }) => (error ? { ...rest, [el.id]: error } : rest));
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const found = validateForm(form, values);
    setErrors(found);
    const firstInvalid = form.elements.find(el => found[el.id]);
    if (firstInvalid) {
      setSubmitted(null);
      document
        .getElementById(`el-${firstInvalid.id}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const data = Object.fromEntries(
      form.elements.filter(isInput).map(el => {
        const v = values[el.id];
        const shown =
          el.type === 'file'
            ? ((v as File[] | undefined) ?? []).map(f => f.name)
            : el.type === 'checkbox'
              ? Boolean(v)
              : el.type === 'number' && v !== undefined && v !== ''
                ? Number(v)
                : (v ?? null);
        return [el.id, shown];
      }),
    );
    setSubmitted(JSON.stringify(data, null, 2));
  };

  const hasInputs = form.elements.some(isInput);

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-1">
      {(form.title || form.description) && (
        <header className="mb-4 border-b border-line px-3 pb-5">
          {form.title && (
            <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-balance">
              {form.title}
            </h1>
          )}
          {form.description && (
            <p className="mt-2 text-[15px] leading-relaxed text-muted">{form.description}</p>
          )}
        </header>
      )}

      {form.elements.map(el => (
        <ElementShell
          key={el.id}
          el={el}
          selected={el.id === selectedId}
          changed={changed.has(el.id)}
          onSelect={onSelect}
        >
          {isInput(el) ? (
            <Field el={el} error={errors[el.id]}>
              <Control
                el={el}
                value={values[el.id]}
                invalid={Boolean(errors[el.id])}
                onChange={v => setValue(el, v)}
              />
            </Field>
          ) : (
            <Content el={el} />
          )}
        </ElementShell>
      ))}

      {hasInputs && (
        <div className="mt-4 px-3">
          <button
            type="submit"
            className="rounded-md bg-accent px-5 py-2.5 text-[15px] font-medium text-white transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {form.submitLabel || 'Submit'}
          </button>
        </div>
      )}

      {submitted && (
        <div className="mx-3 mt-5 rounded-md border border-line bg-canvas/60 p-4" role="status">
          <p className="text-sm font-medium">Valid — this is what would be submitted</p>
          <pre className="mt-2 overflow-x-auto font-mono text-[13px] leading-relaxed text-muted">
            {submitted}
          </pre>
        </div>
      )}
    </form>
  );
}

/** Wraps every element: selection, the id tag, and the "just changed" flash. */
function ElementShell({
  el,
  selected,
  changed,
  onSelect,
  children,
}: {
  el: FormElement;
  selected: boolean;
  changed: boolean;
  onSelect: (id: string | null) => void;
  children: ReactNode;
}) {
  return (
    <div
      id={`el-${el.id}`}
      onClick={e => {
        // clicks on the controls themselves are for trying out the form
        if ((e.target as HTMLElement).closest('input, textarea, select, button, label, a')) return;
        onSelect(selected ? null : el.id);
      }}
      className={`group relative cursor-pointer rounded-lg px-3 py-3 outline-1 transition-[outline-color] ${
        selected ? 'bg-accent-soft/50 outline-accent' : 'outline-transparent hover:outline-line'
      } ${changed ? 'just-changed' : ''}`}
    >
      <button
        type="button"
        onClick={() => onSelect(selected ? null : el.id)}
        aria-pressed={selected}
        title={selected ? 'Deselect' : 'Select to talk about this element in the chat'}
        className={`absolute right-2 top-2 rounded px-1.5 py-0.5 font-mono text-[11px] transition ${
          selected
            ? 'bg-accent text-white'
            : 'bg-canvas text-muted opacity-0 focus-visible:opacity-100 group-hover:opacity-100'
        }`}
      >
        {el.id}
      </button>
      {children}
    </div>
  );
}

function Content({ el }: { el: Exclude<FormElement, InputElement> }) {
  switch (el.type) {
    case 'heading': {
      if (el.level === 1)
        return <h1 className="pr-16 text-2xl font-semibold tracking-tight text-balance">{el.text}</h1>;
      if (el.level === 2)
        return <h2 className="pr-16 pt-3 text-lg font-semibold tracking-tight text-balance">{el.text}</h2>;
      return (
        <h3 className="pr-16 pt-1 text-sm font-semibold uppercase tracking-wide text-muted">
          {el.text}
        </h3>
      );
    }
    case 'paragraph':
      return (
        <p className="max-w-[65ch] whitespace-pre-line pr-16 text-[15px] leading-relaxed text-muted">
          {el.text}
        </p>
      );
    case 'divider':
      return <hr className="my-2 border-line" />;
  }
}

/** Label, help text and error message around an input control. */
function Field({ el, error, children }: { el: InputElement; error?: string; children: ReactNode }) {
  const grouped = ['radio', 'checkboxGroup', 'rating'].includes(el.type);
  const labelText = (
    <>
      {el.label}
      {el.required && (
        <span className="ml-0.5 text-danger" aria-hidden>
          *
        </span>
      )}
    </>
  );
  const help = el.helpText && (
    <p id={`${el.id}-help`} className="mt-0.5 text-[13px] leading-snug text-muted">
      {el.helpText}
    </p>
  );
  const message = error && (
    <p id={`${el.id}-error`} className="mt-1.5 text-[13px] font-medium text-danger">
      {error}
    </p>
  );

  // a single checkbox carries its own label next to the box
  if (el.type === 'checkbox') {
    return (
      <div className="pr-16">
        <label className="flex items-start gap-2.5 text-[15px]">
          {children}
          <span>
            <span className="font-medium">{labelText}</span>
            {help}
          </span>
        </label>
        {message}
      </div>
    );
  }

  if (grouped) {
    return (
      <fieldset aria-describedby={error ? `${el.id}-error` : undefined}>
        <legend className="pr-16 text-[15px] font-medium">{labelText}</legend>
        {help}
        <div className="mt-2">{children}</div>
        {message}
      </fieldset>
    );
  }

  return (
    <div>
      <label htmlFor={el.id} className="block pr-16 text-[15px] font-medium">
        {labelText}
      </label>
      {help}
      <div className="mt-1.5">{children}</div>
      {message}
    </div>
  );
}

function Control({
  el,
  value,
  invalid,
  onChange,
}: {
  el: InputElement;
  value: unknown;
  invalid: boolean;
  onChange: (value: unknown) => void;
}) {
  const aria = {
    id: el.id,
    name: el.id,
    'aria-invalid': invalid,
    'aria-describedby':
      [invalid && `${el.id}-error`, el.helpText && `${el.id}-help`].filter(Boolean).join(' ') ||
      undefined,
  };

  switch (el.type) {
    case 'text': {
      const format = el.validation?.format;
      return (
        <input
          {...aria}
          type={format ?? 'text'}
          className={control}
          placeholder={el.placeholder}
          maxLength={el.validation?.maxLength}
          value={(value as string) ?? ''}
          onChange={e => onChange(e.target.value)}
        />
      );
    }
    case 'textarea': {
      const max = el.validation?.maxLength;
      const length = ((value as string) ?? '').length;
      return (
        <>
          <textarea
            {...aria}
            rows={el.rows ?? 4}
            className={`${control} resize-y leading-relaxed`}
            placeholder={el.placeholder}
            value={(value as string) ?? ''}
            onChange={e => onChange(e.target.value)}
          />
          {max !== undefined && (
            <p
              className={`mt-1 text-right text-xs tabular-nums ${
                length > max ? 'font-medium text-danger' : 'text-faint'
              }`}
            >
              {length} / {max}
            </p>
          )}
        </>
      );
    }
    case 'number':
      return (
        <input
          {...aria}
          type="number"
          inputMode={el.validation?.integer ? 'numeric' : 'decimal'}
          className={`${control} max-w-48`}
          placeholder={el.placeholder}
          min={el.validation?.min}
          max={el.validation?.max}
          step={el.validation?.integer ? 1 : 'any'}
          value={(value as string) ?? ''}
          onChange={e => onChange(e.target.value)}
        />
      );
    case 'date':
      return (
        <input
          {...aria}
          type="date"
          className={`${control} max-w-48`}
          min={el.validation?.minDate}
          max={el.validation?.maxDate}
          value={(value as string) ?? ''}
          onChange={e => onChange(e.target.value)}
        />
      );
    case 'select':
      return (
        <select
          {...aria}
          className={control}
          value={(value as string) ?? ''}
          onChange={e => onChange(e.target.value)}
        >
          <option value="">{el.placeholder ?? 'Choose…'}</option>
          {el.options.map(o => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    case 'radio':
      return (
        <div className="flex flex-col gap-2">
          {el.options.map(o => (
            <label key={o.value} className="flex items-center gap-2.5 text-[15px]">
              <input
                type="radio"
                name={el.id}
                className="size-4 accent-accent"
                checked={value === o.value}
                onChange={() => onChange(o.value)}
              />
              {o.label}
            </label>
          ))}
        </div>
      );
    case 'checkbox':
      return (
        <input
          {...aria}
          type="checkbox"
          className="mt-0.5 size-4 shrink-0 accent-accent"
          checked={Boolean(value)}
          onChange={e => onChange(e.target.checked)}
        />
      );
    case 'checkboxGroup': {
      const picked = (value as string[]) ?? [];
      return (
        <div className="flex flex-col gap-2">
          {el.options.map(o => (
            <label key={o.value} className="flex items-center gap-2.5 text-[15px]">
              <input
                type="checkbox"
                name={el.id}
                className="size-4 accent-accent"
                checked={picked.includes(o.value)}
                onChange={e =>
                  onChange(
                    e.target.checked ? [...picked, o.value] : picked.filter(v => v !== o.value),
                  )
                }
              />
              {o.label}
            </label>
          ))}
        </div>
      );
    }
    case 'file': {
      const files = (value as File[]) ?? [];
      const v = el.validation;
      const limits = [
        v?.accept?.length && v.accept.join(', '),
        v?.maxSizeMb !== undefined && `max ${v.maxSizeMb} MB`,
        el.multiple && v?.maxFiles !== undefined && `up to ${v.maxFiles} files`,
      ].filter(Boolean);
      return (
        <div
          className={`rounded-md border border-dashed bg-white px-4 py-4 ${
            invalid ? 'border-danger' : 'border-line'
          }`}
        >
          <input
            {...aria}
            type="file"
            multiple={el.multiple}
            accept={v?.accept?.join(',')}
            className="block w-full text-sm text-muted file:mr-3 file:cursor-pointer file:rounded-md file:border file:border-line file:bg-canvas file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink"
            onChange={e => onChange(Array.from(e.target.files ?? []))}
          />
          {limits.length > 0 && <p className="mt-2 text-xs text-faint">{limits.join(' · ')}</p>}
          {files.length > 1 && (
            <ul className="mt-2 text-[13px] text-muted">
              {files.map(f => (
                <li key={f.name}>{f.name}</li>
              ))}
            </ul>
          )}
        </div>
      );
    }
    case 'rating': {
      const max = el.max ?? 5;
      return (
        <div className="inline-flex flex-col gap-1.5">
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: max }, (_, i) => i + 1).map(n => (
              <label key={n} className="relative">
                <input
                  type="radio"
                  name={el.id}
                  className="peer sr-only"
                  checked={value === n}
                  onChange={() => onChange(n)}
                />
                <span className="flex size-10 cursor-pointer items-center justify-center rounded-md border border-line bg-white text-[15px] font-medium tabular-nums transition hover:border-accent peer-checked:border-accent peer-checked:bg-accent peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-accent/30">
                  {n}
                </span>
              </label>
            ))}
          </div>
          {(el.lowLabel || el.highLabel) && (
            <div className="flex justify-between gap-4 text-xs text-muted">
              <span>{el.lowLabel}</span>
              <span>{el.highLabel}</span>
            </div>
          )}
        </div>
      );
    }
  }
}
