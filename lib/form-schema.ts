import { z } from 'zod';

/**
 * The form definition. This zod schema is the single source of truth:
 * - TypeScript types are inferred from it
 * - the published JSON Schema (/api/schema) is generated from it
 * - every change the LLM makes is validated against it
 */

const id = z
  .string()
  .regex(/^[a-z][a-z0-9_]*$/, 'lowercase snake_case, starting with a letter')
  .describe('Unique element id, also used as the field name in submitted data');

const option = z.object({
  value: z.string().min(1),
  label: z.string().min(1),
});

const inputBase = {
  id,
  label: z.string().min(1).describe('Visible label / question'),
  helpText: z.string().optional().describe('Small hint shown under the label'),
  required: z.boolean().optional().describe('Field must be filled in'),
};

// ── Content elements ────────────────────────────────────────────────────────

const heading = z.object({
  id,
  type: z.literal('heading'),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  text: z.string().min(1),
});

const paragraph = z.object({
  id,
  type: z.literal('paragraph'),
  text: z.string().min(1),
});

const divider = z.object({ id, type: z.literal('divider') });

// ── Input elements ──────────────────────────────────────────────────────────

const text = z.object({
  ...inputBase,
  type: z.literal('text'),
  placeholder: z.string().optional(),
  validation: z
    .object({
      minLength: z.number().int().min(0).optional(),
      maxLength: z.number().int().min(1).optional(),
      pattern: z.string().optional().describe('JavaScript regular expression'),
      patternMessage: z.string().optional().describe('Error shown when pattern fails'),
      format: z.enum(['email', 'url', 'tel']).optional(),
    })
    .optional(),
});

const textarea = z.object({
  ...inputBase,
  type: z.literal('textarea'),
  placeholder: z.string().optional(),
  rows: z.number().int().min(2).max(20).optional(),
  validation: z
    .object({
      minLength: z.number().int().min(0).optional(),
      maxLength: z.number().int().min(1).optional(),
    })
    .optional(),
});

const number = z.object({
  ...inputBase,
  type: z.literal('number'),
  placeholder: z.string().optional(),
  validation: z
    .object({
      min: z.number().optional(),
      max: z.number().optional(),
      integer: z.boolean().optional(),
    })
    .optional(),
});

const date = z.object({
  ...inputBase,
  type: z.literal('date'),
  validation: z
    .object({
      minDate: z.string().optional().describe('YYYY-MM-DD'),
      maxDate: z.string().optional().describe('YYYY-MM-DD'),
    })
    .optional(),
});

const select = z.object({
  ...inputBase,
  type: z.literal('select'),
  placeholder: z.string().optional(),
  options: z.array(option).min(1),
});

const radio = z.object({
  ...inputBase,
  type: z.literal('radio'),
  options: z.array(option).min(2),
});

const checkbox = z.object({
  ...inputBase,
  type: z.literal('checkbox'),
});

const checkboxGroup = z.object({
  ...inputBase,
  type: z.literal('checkboxGroup'),
  options: z.array(option).min(1),
  validation: z
    .object({
      minSelected: z.number().int().min(0).optional(),
      maxSelected: z.number().int().min(1).optional(),
    })
    .optional(),
});

const file = z.object({
  ...inputBase,
  type: z.literal('file'),
  multiple: z.boolean().optional(),
  validation: z
    .object({
      accept: z
        .array(z.string())
        .optional()
        .describe('Allowed extensions or MIME types, e.g. [".pdf", "image/*"]'),
      maxSizeMb: z.number().positive().optional(),
      maxFiles: z.number().int().min(1).optional(),
    })
    .optional(),
});

const rating = z.object({
  ...inputBase,
  type: z.literal('rating'),
  max: z.number().int().min(2).max(10).optional().describe('Scale size, default 5'),
  lowLabel: z.string().optional().describe('Caption for the lowest score'),
  highLabel: z.string().optional().describe('Caption for the highest score'),
});

export const formElementSchema = z.discriminatedUnion('type', [
  heading,
  paragraph,
  divider,
  text,
  textarea,
  number,
  date,
  select,
  radio,
  checkbox,
  checkboxGroup,
  file,
  rating,
]);

export const formSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  submitLabel: z.string().optional(),
  elements: z.array(formElementSchema),
});

export type FormElement = z.infer<typeof formElementSchema>;
export type FormDefinition = z.infer<typeof formSchema>;
export type ElementType = FormElement['type'];

export const ELEMENT_TYPES = formElementSchema.options.map(
  o => o.shape.type.value,
) as [ElementType, ...ElementType[]];

export const CONTENT_TYPES: ElementType[] = ['heading', 'paragraph', 'divider'];

export const isInput = (
  el: FormElement,
): el is Exclude<FormElement, { type: 'heading' | 'paragraph' | 'divider' }> =>
  !CONTENT_TYPES.includes(el.type);

export const emptyForm: FormDefinition = { elements: [] };

export const formJsonSchema = () =>
  z.toJSONSchema(formSchema, { target: 'draft-2020-12' });
