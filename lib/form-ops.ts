import { z } from 'zod';
import {
  ELEMENT_TYPES,
  formElementSchema,
  type FormDefinition,
  type FormElement,
} from './form-schema';

/**
 * Pure operations on a form definition. The LLM tools are thin wrappers
 * around these, so they can be tested (or reused from UI code) without a model.
 *
 * The LLM sends a *flat* element (every property optional, one enum for type)
 * because that shape is handled reliably by all OpenAI-compatible models,
 * including small local ones. It is normalised and then strictly validated
 * against the real discriminated-union schema.
 */

export const flatElementSchema = z.object({
  type: z.enum(ELEMENT_TYPES),
  id: z
    .string()
    .optional()
    .describe('snake_case id. Omit to derive one from the label/text.'),
  label: z.string().optional().describe('Label for input elements'),
  text: z.string().optional().describe('Text for heading / paragraph'),
  level: z.number().optional().describe('Heading level 1-3'),
  helpText: z.string().optional(),
  placeholder: z.string().optional(),
  required: z.boolean().optional(),
  options: z
    .array(z.string())
    .optional()
    .describe('Option labels for select / radio / checkboxGroup'),
  rows: z.number().optional().describe('textarea rows'),
  multiple: z.boolean().optional().describe('file: allow several files'),
  max: z.number().optional().describe('rating: scale size (default 5)'),
  lowLabel: z.string().optional().describe('rating: caption for lowest score'),
  highLabel: z.string().optional().describe('rating: caption for highest score'),
  validation: z
    .object({
      minLength: z.number().optional().describe('text, textarea'),
      maxLength: z.number().optional().describe('text, textarea'),
      pattern: z.string().optional().describe('text: JS regex'),
      patternMessage: z.string().optional().describe('text: error for pattern'),
      format: z.enum(['email', 'url', 'tel']).optional().describe('text'),
      min: z.number().optional().describe('number'),
      max: z.number().optional().describe('number'),
      integer: z.boolean().optional().describe('number'),
      minDate: z.string().optional().describe('date, YYYY-MM-DD'),
      maxDate: z.string().optional().describe('date, YYYY-MM-DD'),
      minSelected: z.number().optional().describe('checkboxGroup'),
      maxSelected: z.number().optional().describe('checkboxGroup'),
      accept: z.array(z.string()).optional().describe('file: [".pdf","image/*"]'),
      maxSizeMb: z.number().optional().describe('file'),
      maxFiles: z.number().optional().describe('file'),
    })
    .optional()
    .describe('Validation rules; only the ones matching the type are kept'),
});

export type FlatElement = z.infer<typeof flatElementSchema>;

export type OpResult =
  | { ok: true; form: FormDefinition; summary: string }
  | { ok: false; error: string };

const fail = (error: string): OpResult => ({ ok: false, error });

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'oe')
    .replace(/å/g, 'aa')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^([^a-z])/, 'f_$1')
    .slice(0, 40);

function uniqueId(wanted: string, taken: Set<string>) {
  const base = wanted || 'element';
  let candidate = base;
  for (let n = 2; taken.has(candidate); n++) candidate = `${base}_${n}`;
  return candidate;
}

/** Keys each element type's schema knows about, e.g. validation keys per type. */
function shapeOf(type: FormElement['type']) {
  return formElementSchema.options.find(o => o.shape.type.value === type)!.shape;
}

/** Flat LLM element → strict FormElement (or a readable error). */
function normalise(
  flat: Record<string, unknown>,
  taken: Set<string>,
): { ok: true; element: FormElement } | { ok: false; error: string } {
  const type = flat.type as FormElement['type'];
  if (!ELEMENT_TYPES.includes(type)) {
    return { ok: false, error: `Unknown element type "${String(flat.type)}"` };
  }
  const shape = shapeOf(type) as Record<string, z.ZodType>;

  const candidate: Record<string, unknown> = {};
  for (const key of Object.keys(shape)) {
    if (flat[key] !== undefined && flat[key] !== null) candidate[key] = flat[key];
  }

  // options: accept plain labels as well as {value,label}
  if (Array.isArray(candidate.options)) {
    const seen = new Set<string>();
    candidate.options = candidate.options.map(o => {
      const opt =
        typeof o === 'string' ? { value: slugify(o) || o, label: o } : (o as { value: string; label: string });
      const value = uniqueId(opt.value, seen);
      seen.add(value);
      return { ...opt, value };
    });
  }

  // validation: keep only the rules this type supports, drop when empty
  if (candidate.validation && typeof candidate.validation === 'object') {
    const inner = shape.validation;
    const allowed =
      inner instanceof z.ZodOptional && inner.unwrap() instanceof z.ZodObject
        ? Object.keys((inner.unwrap() as z.ZodObject).shape)
        : [];
    const kept = Object.fromEntries(
      Object.entries(candidate.validation).filter(
        ([k, v]) => allowed.includes(k) && v !== undefined && v !== null,
      ),
    );
    if (Object.keys(kept).length) candidate.validation = kept;
    else delete candidate.validation;
  }

  if (type === 'heading' && candidate.level === undefined) candidate.level = 2;

  const wanted =
    typeof flat.id === 'string' && flat.id
      ? slugify(flat.id)
      : slugify(String(flat.label ?? flat.text ?? type));
  candidate.id = uniqueId(wanted || type, taken);

  const parsed = formElementSchema.safeParse(candidate);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map(i => `${i.path.join('.') || '(element)'}: ${i.message}`)
      .join('; ');
    return { ok: false, error: `Invalid ${type} element — ${issues}` };
  }
  return { ok: true, element: parsed.data };
}

export function addElements(
  form: FormDefinition,
  elements: FlatElement[],
  afterId?: string | null,
  atStart?: boolean,
): OpResult {
  let index = form.elements.length;
  if (atStart) index = 0;
  else if (afterId) {
    const found = form.elements.findIndex(e => e.id === afterId);
    if (found < 0) return fail(`No element with id "${afterId}"`);
    index = found + 1;
  }

  const taken = new Set(form.elements.map(e => e.id));
  const added: FormElement[] = [];
  for (const flat of elements) {
    const result = normalise(flat, taken);
    if (!result.ok) return fail(result.error);
    taken.add(result.element.id);
    added.push(result.element);
  }

  const next = [...form.elements];
  next.splice(index, 0, ...added);
  return {
    ok: true,
    form: { ...form, elements: next },
    summary:
      added.length > 3
        ? `Added ${added.length} elements`
        : `Added ${added.map(e => `${e.id} (${e.type})`).join(', ')}`,
  };
}

export function updateElement(
  form: FormDefinition,
  id: string,
  changes: Partial<FlatElement>,
): OpResult {
  const index = form.elements.findIndex(e => e.id === id);
  if (index < 0) return fail(`No element with id "${id}"`);
  const current = form.elements[index] as Record<string, unknown>;

  const merged: Record<string, unknown> = { ...current, ...changes };
  // validation rules merge key by key, so "make it max 200 chars" keeps the rest
  if (changes.validation) {
    merged.validation = {
      ...(current.validation as object | undefined),
      ...changes.validation,
    };
  }
  // when options were not touched, keep their existing values untouched
  if (!changes.options && current.options) merged.options = current.options;
  if (!changes.id) merged.id = id;

  const taken = new Set(form.elements.filter((_, i) => i !== index).map(e => e.id));
  const result = normalise(merged, taken);
  if (!result.ok) return fail(result.error);

  const next = [...form.elements];
  next[index] = result.element;
  return {
    ok: true,
    form: { ...form, elements: next },
    summary: `Updated ${result.element.id} (${result.element.type})`,
  };
}

export function removeElements(form: FormDefinition, ids: string[]): OpResult {
  const missing = ids.filter(i => !form.elements.some(e => e.id === i));
  if (missing.length) return fail(`No element with id: ${missing.join(', ')}`);
  return {
    ok: true,
    form: { ...form, elements: form.elements.filter(e => !ids.includes(e.id)) },
    summary: `Removed ${ids.join(', ')}`,
  };
}

export function moveElement(
  form: FormDefinition,
  id: string,
  afterId?: string | null,
): OpResult {
  const element = form.elements.find(e => e.id === id);
  if (!element) return fail(`No element with id "${id}"`);
  if (afterId === id) return fail('Cannot move an element after itself');
  const rest = form.elements.filter(e => e.id !== id);
  let index = 0;
  if (afterId) {
    const found = rest.findIndex(e => e.id === afterId);
    if (found < 0) return fail(`No element with id "${afterId}"`);
    index = found + 1;
  }
  rest.splice(index, 0, element);
  return {
    ok: true,
    form: { ...form, elements: rest },
    summary: afterId ? `Moved ${id} after ${afterId}` : `Moved ${id} to the top`,
  };
}

export function setFormMeta(
  form: FormDefinition,
  meta: { title?: string; description?: string; submitLabel?: string },
): OpResult {
  const next = { ...form };
  for (const key of ['title', 'description', 'submitLabel'] as const) {
    if (meta[key] === undefined) continue;
    if (meta[key] === '') delete next[key];
    else next[key] = meta[key];
  }
  return { ok: true, form: next, summary: 'Updated form settings' };
}

/** Compact one-line-per-element outline, used to show the model the form. */
export function outline(form: FormDefinition) {
  if (!form.elements.length) return '(the form has no elements yet)';
  return form.elements
    .map((e, i) => {
      const { id, type, ...rest } = e;
      return `${i + 1}. ${id} [${type}] ${JSON.stringify(rest)}`;
    })
    .join('\n');
}
