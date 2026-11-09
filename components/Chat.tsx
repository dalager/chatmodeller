'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, getToolName, isToolUIPart } from 'ai';
import { useEffect, useRef, useState } from 'react';
import type { OpResult } from '@/lib/form-ops';
import type { FormDefinition } from '@/lib/form-schema';

const STARTERS = [
  'A customer satisfaction survey for a café',
  'Job application form with CV upload',
  'Event sign-up with dietary needs and a consent checkbox',
];

const TOOL_LABELS: Record<string, string> = {
  add_elements: 'Adding elements',
  update_element: 'Updating element',
  remove_elements: 'Removing elements',
  move_element: 'Moving element',
  set_form_settings: 'Updating form settings',
  clear_form: 'Clearing the form',
};

export function Chat({
  form,
  selectedId,
  onFormChange,
  onClearSelection,
}: {
  form: FormDefinition;
  selectedId: string | null;
  onFormChange: (form: FormDefinition) => void;
  onClearSelection: () => void;
}) {
  // The transport is created once; it reads the latest form through this ref
  // so every request carries the form exactly as the user sees it.
  const context = useRef({ form, selectedId });
  useEffect(() => {
    context.current = { form, selectedId };
  });

  const [transport] = useState(
    () =>
      new DefaultChatTransport({
        api: '/api/chat',
        body: () => context.current,
      }),
  );

  const { messages, sendMessage, status, error, stop, clearError, setMessages } = useChat({
    transport,
  });
  const busy = status === 'submitted' || status === 'streaming';

  // Every successful tool result carries the new form: apply each one once.
  const applied = useRef(new Set<string>());
  useEffect(() => {
    for (const message of messages) {
      if (message.role !== 'assistant') continue;
      for (const part of message.parts) {
        if (!isToolUIPart(part) || part.state !== 'output-available') continue;
        if (applied.current.has(part.toolCallId)) continue;
        applied.current.add(part.toolCallId);
        const output = part.output as OpResult;
        if (output?.ok) onFormChange(output.form);
      }
    }
  }, [messages, onFormChange]);

  const [input, setInput] = useState('');
  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    clearError();
    sendMessage({ text: trimmed });
    setInput('');
  };

  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages, status]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-line px-4">
        <h2 className="text-sm font-semibold">Assistant</h2>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => {
              stop();
              setMessages([]);
              clearError();
            }}
            className="rounded px-2 py-1 text-xs text-muted hover:bg-canvas hover:text-ink"
          >
            New chat
          </button>
        )}
      </header>

      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col justify-end gap-2 pb-2">
            <p className="text-[15px] font-medium">Describe the form you need.</p>
            <p className="mb-2 text-sm leading-relaxed text-muted">
              I build it on the left while we talk. Click an element in the preview to point at it,
              then say what should change.
            </p>
            {STARTERS.map(s => (
              <button
                key={s}
                type="button"
                onClick={() => send(s)}
                className="rounded-md border border-line px-3 py-2 text-left text-sm text-ink transition hover:border-accent hover:bg-accent-soft/40"
              >
                {s}
              </button>
            ))}
          </div>
        ) : (
          <ol className="flex flex-col gap-4">
            {messages.map(message => (
              <li
                key={message.id}
                className={message.role === 'user' ? 'flex justify-end' : 'flex flex-col gap-1.5'}
              >
                {message.parts.map((part, i) => {
                  if (part.type === 'text' && part.text.trim()) {
                    return message.role === 'user' ? (
                      <p
                        key={i}
                        className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-ink px-3.5 py-2 text-[15px] leading-relaxed text-white"
                      >
                        {part.text}
                      </p>
                    ) : (
                      <p key={i} className="whitespace-pre-wrap text-[15px] leading-relaxed">
                        {part.text}
                      </p>
                    );
                  }
                  if (isToolUIPart(part)) return <ToolStep key={part.toolCallId} part={part} />;
                  return null;
                })}
              </li>
            ))}
            {busy && !messages.at(-1)?.parts.some(p => p.type === 'text' && p.text.trim() && messages.at(-1)?.role === 'assistant') && (
              <li className="animate-pulse text-sm text-faint">
                {messages.at(-1)?.parts.some(isToolUIPart) ? 'Working…' : 'Thinking…'}
              </li>
            )}
          </ol>
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="mx-4 mb-2 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger"
        >
          <p className="font-medium">The assistant could not answer.</p>
          <p className="mt-0.5 break-words">{readableError(error)}</p>
        </div>
      )}

      <form
        onSubmit={e => {
          e.preventDefault();
          send(input);
        }}
        className="shrink-0 border-t border-line p-3"
      >
        {selectedId && (
          <div className="mb-2 flex items-center gap-1.5 text-xs text-muted">
            <span>About</span>
            <span className="rounded bg-accent px-1.5 py-0.5 font-mono text-[11px] text-white">
              {selectedId}
            </span>
            <button
              type="button"
              onClick={onClearSelection}
              aria-label="Clear selection"
              className="rounded px-1 text-sm leading-none hover:bg-canvas hover:text-ink"
            >
              ×
            </button>
          </div>
        )}
        <div className="flex items-end gap-2 rounded-lg border border-line bg-white p-2 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={2}
            aria-label="Message"
            placeholder={
              selectedId ? `What should change about ${selectedId}?` : 'Ask for a form or a change…'
            }
            className="min-h-0 flex-1 resize-none bg-transparent px-1.5 py-1 text-[15px] leading-relaxed outline-none placeholder:text-faint"
          />
          {busy ? (
            <button
              type="button"
              onClick={() => stop()}
              className="rounded-md border border-line px-3 py-1.5 text-sm font-medium hover:bg-canvas"
            >
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white transition hover:brightness-110 disabled:opacity-40"
            >
              Send
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

/** One tool call, shown as a compact step: pending → what changed (or why not). */
function ToolStep({ part }: { part: Parameters<typeof getToolName>[0] }) {
  const output = part.state === 'output-available' ? (part.output as OpResult) : null;
  const failed = part.state === 'output-error' || (output && !output.ok);
  const text =
    part.state === 'output-error'
      ? part.errorText
      : output
        ? output.ok
          ? output.summary
          : output.error
        : `${TOOL_LABELS[getToolName(part)] ?? getToolName(part)}…`;

  return (
    <p
      className={`flex items-start gap-2 rounded-md px-2.5 py-1.5 text-[13px] leading-snug ${
        failed ? 'bg-danger-soft text-danger' : 'bg-canvas text-muted'
      }`}
    >
      <span aria-hidden className="font-mono">
        {failed ? '!' : output ? '✓' : '·'}
      </span>
      <span className="min-w-0 break-words">{text}</span>
    </p>
  );
}

function readableError(error: Error) {
  try {
    const parsed = JSON.parse(error.message);
    if (typeof parsed?.error === 'string') return parsed.error;
  } catch {
    // not JSON — use the message as is
  }
  return error.message || 'Unknown error';
}
