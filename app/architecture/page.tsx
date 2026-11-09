import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Mermaid } from '@/components/Mermaid';

export const metadata: Metadata = {
  title: 'Architecture — Chatmodeller',
  description: 'How the chat-driven form builder is put together',
};

const OVERVIEW = `
flowchart TB
  subgraph B["Browser"]
    direction LR
    LS[("localStorage")]
    Page["page.tsx<br/>owns the form definition"]
    Preview["FormRenderer<br/>live form + validation"]
    Json["JsonEditor<br/>edit the definition by hand"]
    Chat["Chat<br/>useChat from the AI SDK"]
    LS <--> Page
    Page <-- "form / selection" --> Preview
    Page <-- "form / valid edit" --> Json
    Page <-- "form + selection / new form" --> Chat
  end

  subgraph S["Next.js server, stateless"]
    direction LR
    Route["POST /api/chat<br/>system prompt + tool loop"]
    Tools["form-tools.ts<br/>six tools"]
    Ops["form-ops.ts<br/>pure functions"]
    Schema["form-schema.ts<br/>zod, single source of truth"]
    SchemaRoute["GET /api/schema<br/>JSON Schema"]
    Route --> Tools --> Ops --> Schema
    SchemaRoute --> Schema
  end

  LLM["OpenAI-compatible endpoint<br/>/v1/chat/completions"]

  Chat -- "messages + form + selectedId" --> Route
  Route -. "UI message stream: tool results, text" .-> Chat
  Route -- "prompt, tool results" --> LLM
  LLM -. "tool calls, text" .-> Route
`;

const BUILD = `
sequenceDiagram
  autonumber
  actor U as User
  participant C as Chat (browser)
  participant R as /api/chat
  participant T as Tools + form-ops
  participant M as LLM

  U->>C: "A café survey"
  C->>R: POST messages, form, selectedId
  Note over R: Validate form against the schema.<br/>It becomes the working copy for this request.
  R->>M: system prompt (rules + current form) + messages + tool definitions

  M-->>R: tool calls: set_form_settings, add_elements
  R->>T: set_form_settings(title, description, submitLabel)
  T-->>R: ok, new form
  R-->>C: tool-output-available (full form)
  C->>C: apply form, preview re-renders
  R->>T: add_elements([...15 flat elements])
  Note over T: Derive ids, normalise options,<br/>keep only rules valid for each type,<br/>validate every element against the schema.
  T-->>R: ok, new form
  R-->>C: tool-output-available (full form)
  C->>C: apply form, new elements flash

  R->>M: tool results as one line each ("OK. Added 15 elements. Order is now ...")
  M-->>R: "Your survey is ready."
  R-->>C: text deltas, finish
  C-->>U: short answer under the tool steps
`;

const EDIT = `
sequenceDiagram
  autonumber
  actor U as User
  participant P as Preview
  participant C as Chat (browser)
  participant R as /api/chat
  participant T as Tools + form-ops
  participant M as LLM

  U->>P: click the rating element
  P->>C: selectedId = "forventninger"
  U->>C: "make this 1-10 and move it under email"
  C->>R: POST messages, form, selectedId
  Note over R: System prompt gets one extra line:<br/>the user has selected "forventninger",<br/>so "this" means that element.
  R->>M: prompt + messages + tool definitions

  M-->>R: tool calls: update_element, move_element
  R->>T: update_element(id, changes: max 10)
  Note over T: Merge changes into the element,<br/>re-validate the whole element.
  T-->>R: ok, new form
  R-->>C: tool-output-available
  R->>T: move_element(id, afterId: "email")
  Note over T: Runs on the form the previous<br/>call produced, not the original.
  T-->>R: ok, new form
  R-->>C: tool-output-available
  C->>P: form updated, changed element flashes

  R->>M: one-line results
  M-->>R: "The scale is now 1-10, right under email."
  R-->>C: text, finish
`;

const RETRY = `
sequenceDiagram
  autonumber
  participant R as /api/chat
  participant T as Tools + form-ops
  participant M as LLM
  participant C as Chat (browser)

  M-->>R: add_elements([radio with one option])
  R->>T: add_elements(...)
  Note over T: Schema says a radio needs<br/>at least two options.
  T-->>R: ok: false, error
  R-->>C: tool-output-available (error)
  Note over C: Shown as a red step.<br/>The form is not touched.
  R->>M: "ERROR: Invalid radio element ... Nothing was changed, fix the input and try again."
  M-->>R: add_elements([radio with three options])
  R->>T: add_elements(...)
  T-->>R: ok, new form
  R-->>C: tool-output-available (full form)
  Note over R: The loop stops when the model answers<br/>in text, or after 8 steps.
`;

const TOOLS: { name: string; input: string; does: string }[] = [
  {
    name: 'add_elements',
    input: 'elements[], afterId?, atStart?',
    does: 'Adds one or many elements, at the end by default. A whole form is built in a single call.',
  },
  {
    name: 'update_element',
    input: 'id, changes',
    does: 'Changes only the properties sent. Validation rules merge with the existing ones. The type can change too.',
  },
  {
    name: 'remove_elements',
    input: 'ids[]',
    does: 'Removes elements. Fails without changing anything if an id does not exist.',
  },
  {
    name: 'move_element',
    input: 'id, afterId?',
    does: 'Moves an element after another one, or to the top when afterId is left out.',
  },
  {
    name: 'set_form_settings',
    input: 'title?, description?, submitLabel?',
    does: 'Sets the form-level texts. An empty string clears one.',
  },
  {
    name: 'clear_form',
    input: '(none)',
    does: 'Empties the form. Only used when the user asks to start over.',
  },
];

const FILES: [string, string][] = [
  ['lib/form-schema.ts', 'The form definition as a zod schema. TypeScript types and the JSON Schema are generated from it.'],
  ['lib/form-ops.ts', 'Pure functions that change a form. They normalise and validate what the model sends.'],
  ['lib/form-tools.ts', 'The six tools: thin wrappers that call an operation and keep the working copy.'],
  ['lib/validate.ts', 'Checks what a person types into the finished form.'],
  ['app/api/chat/route.ts', 'The chat endpoint: builds the system prompt, runs the model and the tool loop, streams the result.'],
  ['app/api/schema/route.ts', 'Serves the JSON Schema.'],
  ['app/page.tsx', 'The split screen. Holds the form and the selection, saves the form to localStorage.'],
  ['components/Chat.tsx', 'Chat panel. Sends the form with each message and applies tool results.'],
  ['components/FormRenderer.tsx', 'Turns a definition into a working form.'],
  ['components/JsonEditor.tsx', 'The definition as editable JSON.'],
];

export default function ArchitecturePage() {
  return (
    <div className="min-h-full bg-canvas">
      <header className="sticky top-0 z-10 flex h-12 items-center gap-4 border-b border-line bg-canvas/95 px-5 backdrop-blur">
        <span className="text-sm font-semibold">Chatmodeller</span>
        <Link
          href="/"
          className="rounded-md px-2.5 py-1 text-sm text-muted transition hover:bg-line/50 hover:text-ink"
        >
          ← Form builder
        </Link>
      </header>

      <main className="mx-auto max-w-[920px] px-6 pb-24 pt-12">
        <h1 className="text-[32px] font-semibold leading-tight tracking-tight text-balance">
          How Chatmodeller is built
        </h1>
        <p className="mt-3 max-w-[65ch] text-[17px] leading-relaxed text-muted">
          You describe a form in the chat and a language model builds it next to the conversation.
          The model never writes the form directly. It calls a small set of tools, and each tool
          makes one checked change to a JSON definition that the browser owns.
        </p>

        <Section title="The pieces">
          <P>
            It is one Next.js app. The browser holds all state. The server is a single stateless
            route handler that sits between the browser and any OpenAI-compatible endpoint.
          </P>
          <Mermaid chart={OVERVIEW} label="Architecture overview: browser, Next.js server and LLM endpoint" />
          <List
            items={[
              [
                'The browser owns the form.',
                'The definition lives in React state and localStorage, and is sent along with every chat message. Edits made by hand and edits made by the model can therefore never drift apart, and the server needs no database or session.',
              ],
              [
                'One schema describes everything.',
                'The zod schema in form-schema.ts produces the TypeScript types, the published JSON Schema, and the check that every change from the model must pass.',
              ],
              [
                'The model works through operations.',
                'Small changes stay small: "make this required" is one update_element call, not a rewrite of the whole form.',
              ],
            ]}
          />
        </Section>

        <Section title="Building a form from one message">
          <P>
            A request can take several rounds with the model. In each round the model either calls
            tools or answers in text. Tool results go back to the model, and the same results are
            streamed to the browser, which is how the preview updates while the model is still
            working.
          </P>
          <Mermaid chart={BUILD} label="Sequence diagram: building a form from a single chat message" />
        </Section>

        <Section title="Editing a selected element">
          <P>
            Clicking an element in the preview selects it. The selection travels with the next
            message and is added to the system prompt, so words like “this” have a meaning. Tool
            calls in the same request build on each other: the second call sees the result of the
            first.
          </P>
          <Mermaid chart={EDIT} label="Sequence diagram: editing a selected element with two tool calls" />
        </Section>

        <Section title="When the model gets it wrong">
          <P>
            A tool never throws on bad input. It returns an error that tells the model what was
            wrong, leaves the form untouched, and the model tries again in the next round.
          </P>
          <Mermaid chart={RETRY} label="Sequence diagram: a tool rejects invalid input and the model retries" />
        </Section>

        <Section title="The tools">
          <P>
            All six tools have the same shape: take the working copy of the form, apply one
            operation from form-ops.ts, and return either the new form or an error.
          </P>
          <div className="overflow-x-auto rounded-lg border border-line bg-white">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-2.5 font-medium">Tool</th>
                  <th className="px-4 py-2.5 font-medium">Input</th>
                  <th className="px-4 py-2.5 font-medium">What it does</th>
                </tr>
              </thead>
              <tbody>
                {TOOLS.map(t => (
                  <tr key={t.name} className="border-b border-line last:border-0 align-top">
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-[13px]">{t.name}</td>
                    <td className="px-4 py-3 font-mono text-[13px] text-muted">{t.input}</td>
                    <td className="px-4 py-3 leading-relaxed">{t.does}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="mt-8 text-base font-semibold">How a tool call is handled</h3>
          <List
            items={[
              [
                'A flat input shape.',
                'The model sends an element as one flat object: a type plus optional properties. The real schema is a union of thirteen element types, which smaller models fill in less reliably. The flat object is converted and then checked against the real schema.',
              ],
              [
                'Normalising.',
                'Ids are derived from the label when missing and made unique. Options given as plain labels get values. Validation rules that do not belong to the element type are dropped.',
              ],
              [
                'Two views of one result.',
                'The browser receives the full new form in the tool result. The model receives one line: what changed and the current order of ids. This keeps the conversation small however large the form grows.',
              ],
              [
                'The form in the prompt wins.',
                'Each request starts with the current form written into the system prompt, so the model always works from what the user sees, including edits made by hand since the last message.',
              ],
            ]}
          />
        </Section>

        <Section title="What goes over the wire">
          <div className="grid gap-4 md:grid-cols-2">
            <Code title="Browser → /api/chat">{`{
  "messages": [ …chat history… ],
  "form": {
    "title": "Café feedback",
    "elements": [
      { "id": "name", "type": "text",
        "label": "Name", "required": true }
    ]
  },
  "selectedId": "name"
}`}</Code>
            <Code title="Tool result → browser">{`{
  "ok": true,
  "summary": "Updated name (text)",
  "form": { …the complete new form… }
}

// the model sees only:
// "OK. Updated name (text).
//  Element order is now: name, email"`}</Code>
          </div>
        </Section>

        <Section title="Where things are">
          <dl className="divide-y divide-line rounded-lg border border-line bg-white">
            {FILES.map(([file, what]) => (
              <div key={file} className="grid gap-1 px-4 py-3 sm:grid-cols-[260px_1fr] sm:gap-4">
                <dt className="font-mono text-[13px]">{file}</dt>
                <dd className="text-sm leading-relaxed text-muted">{what}</dd>
              </div>
            ))}
          </dl>
          <P>
            The stack is Next.js with the Vercel AI SDK (<Mono>ai</Mono>, <Mono>@ai-sdk/react</Mono>
            , <Mono>@ai-sdk/openai-compatible</Mono>), zod and Tailwind. The endpoint, model and
            reasoning effort are set in <Mono>.env.local</Mono>.
          </P>
        </Section>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-14">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <div className="mt-3 flex flex-col gap-5">{children}</div>
    </section>
  );
}

function P({ children }: { children: ReactNode }) {
  return <p className="max-w-[68ch] text-[15px] leading-relaxed text-ink">{children}</p>;
}

function Mono({ children }: { children: ReactNode }) {
  return <code className="rounded bg-line/50 px-1 py-0.5 font-mono text-[13px]">{children}</code>;
}

function List({ items }: { items: [string, string][] }) {
  return (
    <ul className="flex max-w-[68ch] flex-col gap-3">
      {items.map(([lead, rest]) => (
        <li key={lead} className="border-l-2 border-accent pl-4 text-[15px] leading-relaxed">
          <span className="font-medium">{lead}</span> <span className="text-muted">{rest}</span>
        </li>
      ))}
    </ul>
  );
}

function Code({ title, children }: { title: string; children: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-white">
      <p className="border-b border-line px-4 py-2 text-xs font-medium text-muted">{title}</p>
      <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed">{children}</pre>
    </div>
  );
}
