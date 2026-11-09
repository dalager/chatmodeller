import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from 'ai';
import { outline } from '@/lib/form-ops';
import { emptyForm, formSchema } from '@/lib/form-schema';
import { createFormTools } from '@/lib/form-tools';

export const maxDuration = 300;

const SYSTEM = `You are the assistant inside a form builder. The user describes the form they want in the chat; you build and edit it by calling tools. The user sees the form update live next to the chat.

How to work:
- Act, don't describe. When the user asks for something, call the tools right away. Make sensible assumptions rather than asking, unless the request is truly ambiguous.
- Building from scratch: set the title with set_form_settings, then add everything in ONE add_elements call.
- Small edits: use update_element / move_element / remove_elements on the existing ids. Never rebuild the whole form for a small change.
- Use headings (level 2) to group longer forms into sections, and paragraphs for explanatory text. The form title is rendered as the page heading, so do not add a level 1 heading that repeats it.
- Pick the best input type: email/phone/url are "text" with validation.format; a few exclusive choices → radio; many → select; several allowed → checkboxGroup; a single consent tick → checkbox; satisfaction/score questions → rating.
- Add validation where it is obviously right (required on essential fields, format on email, sensible length limits on free text). Don't over-validate.
- Write labels, options and help text in the language the user writes in. ids are always English-ish snake_case.
- If a tool returns ERROR, correct the input and call it again.
- After the tools have run, reply with ONE short plain-text sentence about what changed. No markdown, no lists, and do not repeat the form's contents — the user can see it.

Element types: heading, paragraph, divider (content) and text, textarea, number, date, select, radio, checkbox, checkboxGroup, file, rating (inputs).`;

export async function POST(req: Request) {
  const baseURL = process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';
  const modelId = process.env.OPENAI_MODEL;
  if (!modelId) {
    return Response.json(
      { error: 'OPENAI_MODEL is not set. Copy .env.example to .env.local and fill it in.' },
      { status: 500 },
    );
  }

  const body = (await req.json()) as {
    messages: UIMessage[];
    form?: unknown;
    selectedId?: string | null;
  };

  // The browser owns the form; it sends the current version with every message.
  const parsed = formSchema.safeParse(body.form);
  const state = { form: parsed.success ? parsed.data : emptyForm };
  const tools = createFormTools(state);

  const selected = state.form.elements.find(e => e.id === body.selectedId);

  const provider = createOpenAICompatible({
    name: 'llm',
    baseURL,
    apiKey: process.env.OPENAI_API_KEY,
  });

  const result = streamText({
    model: provider(modelId),
    system: [
      SYSTEM,
      `Current form (authoritative — the user may also have edited it by hand):
title: ${JSON.stringify(state.form.title ?? null)}
description: ${JSON.stringify(state.form.description ?? null)}
submitLabel: ${JSON.stringify(state.form.submitLabel ?? null)}
elements:
${outline(state.form)}`,
      selected
        ? `The user has selected the element "${selected.id}" in the preview. Words like "this", "it" or "here" refer to that element, and "add … below" means after it.`
        : 'No element is selected in the preview.',
    ].join('\n\n'),
    messages: await convertToModelMessages(body.messages, {
      tools,
      ignoreIncompleteToolCalls: true,
    }),
    tools,
    stopWhen: isStepCount(8),
    // Reasoning models: how hard to think before acting. Form edits are
    // simple, so a low setting keeps the chat responsive.
    ...(process.env.OPENAI_REASONING_EFFORT && {
      providerOptions: {
        llm: { reasoningEffort: process.env.OPENAI_REASONING_EFFORT },
      },
    }),
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      tools,
      onError: error => {
        console.error('[chat]', error);
        return error instanceof Error ? error.message : String(error);
      },
    }),
  });
}
