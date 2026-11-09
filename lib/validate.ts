import { isInput, type FormDefinition, type FormElement } from './form-schema';

export type FormValues = Record<string, unknown>;
export type FormErrors = Record<string, string>;

const FORMATS: Record<string, { re: RegExp; message: string }> = {
  email: { re: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Enter a valid email address' },
  url: { re: /^https?:\/\/\S+\.\S+$/, message: 'Enter a valid URL (https://…)' },
  tel: { re: /^[+()\d][\d\s()-]{5,}$/, message: 'Enter a valid phone number' },
};

function fileMatches(file: File, accept: string[]) {
  return accept.some(rule => {
    const r = rule.trim().toLowerCase();
    if (r.startsWith('.')) return file.name.toLowerCase().endsWith(r);
    if (r.endsWith('/*')) return file.type.toLowerCase().startsWith(r.slice(0, -1));
    return file.type.toLowerCase() === r;
  });
}

export function validateElement(el: FormElement, value: unknown): string | null {
  if (!isInput(el)) return null;

  const empty =
    value === undefined ||
    value === null ||
    value === '' ||
    value === false ||
    (Array.isArray(value) && value.length === 0);

  if (empty) return el.required ? 'This field is required' : null;

  switch (el.type) {
    case 'text':
    case 'textarea': {
      const s = String(value);
      const v = el.validation;
      if (v?.minLength !== undefined && s.length < v.minLength)
        return `Use at least ${v.minLength} characters`;
      if (v?.maxLength !== undefined && s.length > v.maxLength)
        return `Use at most ${v.maxLength} characters`;
      if (el.type === 'text') {
        const tv = el.validation;
        if (tv?.format && !FORMATS[tv.format].re.test(s)) return FORMATS[tv.format].message;
        if (tv?.pattern) {
          try {
            if (!new RegExp(tv.pattern).test(s))
              return tv.patternMessage ?? 'This does not match the expected format';
          } catch {
            // an invalid regex from the model should not block the user
          }
        }
      }
      return null;
    }
    case 'number': {
      const n = Number(value);
      const v = el.validation;
      if (Number.isNaN(n)) return 'Enter a number';
      if (v?.integer && !Number.isInteger(n)) return 'Enter a whole number';
      if (v?.min !== undefined && n < v.min) return `Must be ${v.min} or more`;
      if (v?.max !== undefined && n > v.max) return `Must be ${v.max} or less`;
      return null;
    }
    case 'date': {
      const s = String(value);
      const v = el.validation;
      if (v?.minDate && s < v.minDate) return `Must be ${v.minDate} or later`;
      if (v?.maxDate && s > v.maxDate) return `Must be ${v.maxDate} or earlier`;
      return null;
    }
    case 'checkboxGroup': {
      const picked = value as string[];
      const v = el.validation;
      if (v?.minSelected !== undefined && picked.length < v.minSelected)
        return `Select at least ${v.minSelected}`;
      if (v?.maxSelected !== undefined && picked.length > v.maxSelected)
        return `Select at most ${v.maxSelected}`;
      return null;
    }
    case 'file': {
      const files = value as File[];
      const v = el.validation;
      if (v?.maxFiles !== undefined && files.length > v.maxFiles)
        return `Attach at most ${v.maxFiles} file${v.maxFiles === 1 ? '' : 's'}`;
      for (const f of files) {
        if (v?.accept?.length && !fileMatches(f, v.accept))
          return `${f.name}: allowed types are ${v.accept.join(', ')}`;
        if (v?.maxSizeMb !== undefined && f.size > v.maxSizeMb * 1024 * 1024)
          return `${f.name} is larger than ${v.maxSizeMb} MB`;
      }
      return null;
    }
    default:
      return null;
  }
}

export function validateForm(form: FormDefinition, values: FormValues): FormErrors {
  const errors: FormErrors = {};
  for (const el of form.elements) {
    const error = validateElement(el, values[el.id]);
    if (error) errors[el.id] = error;
  }
  return errors;
}
