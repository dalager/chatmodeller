import { tool } from 'ai';
import { z } from 'zod';
import type { FormDefinition } from './form-schema';
import {
  addElements,
  flatElementSchema,
  moveElement,
  removeElements,
  setFormMeta,
  updateElement,
  type OpResult,
} from './form-ops';

/**
 * The tools the model uses to edit the form.
 *
 * `state.form` is the working copy for one request: every tool call applies
 * its change to it, so several calls in a row build on each other. Each
 * successful result carries the full new form, which is how the browser
 * receives the update. The model itself only sees a one-line summary
 * (see `toModelOutput`) to keep its context small.
 */
export function createFormTools(state: { form: FormDefinition }) {
  const apply = (result: OpResult): OpResult => {
    if (result.ok) state.form = result.form;
    return result;
  };

  const describe = (output: OpResult) => ({
    type: 'text' as const,
    value: output.ok
      ? `OK. ${output.summary}. Element order is now: ${
          output.form.elements.map(e => e.id).join(', ') || '(empty)'
        }`
      : `ERROR: ${output.error}. Nothing was changed; fix the input and try again.`,
  });

  return {
    add_elements: tool({
      description:
        'Add one or more elements to the form, in the given order. By default they are appended at the end. Use this with many elements at once when building a form from scratch.',
      inputSchema: z.object({
        elements: z.array(flatElementSchema).min(1),
        afterId: z
          .string()
          .optional()
          .describe('Insert right after the element with this id'),
        atStart: z.boolean().optional().describe('Insert at the top of the form'),
      }),
      execute: async ({ elements, afterId, atStart }) =>
        apply(addElements(state.form, elements, afterId, atStart)),
      toModelOutput: ({ output }) => describe(output),
    }),

    update_element: tool({
      description:
        'Change properties of one existing element. Only send the properties that change; validation rules are merged with the existing ones. The type can be changed too (e.g. radio → select).',
      inputSchema: z.object({
        id: z.string().describe('id of the element to change'),
        changes: flatElementSchema.partial(),
      }),
      execute: async ({ id, changes }) =>
        apply(updateElement(state.form, id, changes)),
      toModelOutput: ({ output }) => describe(output),
    }),

    remove_elements: tool({
      description: 'Remove elements from the form.',
      inputSchema: z.object({ ids: z.array(z.string()).min(1) }),
      execute: async ({ ids }) => apply(removeElements(state.form, ids)),
      toModelOutput: ({ output }) => describe(output),
    }),

    move_element: tool({
      description:
        'Move an element to a new position: right after `afterId`, or to the top of the form when `afterId` is omitted.',
      inputSchema: z.object({
        id: z.string(),
        afterId: z.string().optional(),
      }),
      execute: async ({ id, afterId }) =>
        apply(moveElement(state.form, id, afterId)),
      toModelOutput: ({ output }) => describe(output),
    }),

    set_form_settings: tool({
      description:
        'Set form-level settings: the title and description shown above the form and the submit button label. Pass an empty string to clear one.',
      inputSchema: z.object({
        title: z.string().optional(),
        description: z.string().optional(),
        submitLabel: z.string().optional(),
      }),
      execute: async meta => apply(setFormMeta(state.form, meta)),
      toModelOutput: ({ output }) => describe(output),
    }),

    clear_form: tool({
      description:
        'Remove everything and start over with an empty form. Only when the user asks for a new form.',
      inputSchema: z.object({}),
      execute: async () =>
        apply({ ok: true, form: { elements: [] }, summary: 'Cleared the form' }),
      toModelOutput: ({ output }) => describe(output),
    }),
  };
}

export type FormTools = ReturnType<typeof createFormTools>;
