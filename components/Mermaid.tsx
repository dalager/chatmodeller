'use client';

import { useEffect, useId, useState } from 'react';

/** Renders a mermaid diagram in the browser, styled to match the app. */
export function Mermaid({ chart, label }: { chart: string; label: string }) {
  const id = `m${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { default: mermaid } = await import('mermaid');
        mermaid.initialize({
          startOnLoad: false,
          theme: 'base',
          fontFamily: 'var(--font-geist-sans), system-ui, sans-serif',
          themeVariables: {
            fontSize: '14px',
            background: '#ffffff',
            primaryColor: '#e3efed',
            primaryBorderColor: '#1f5f5b',
            primaryTextColor: '#1d1c19',
            secondaryColor: '#f2f1ec',
            tertiaryColor: '#f7f6f2',
            lineColor: '#6b6960',
            textColor: '#1d1c19',
            clusterBkg: '#f7f6f2',
            clusterBorder: '#dedcd3',
            actorBkg: '#e3efed',
            actorBorder: '#1f5f5b',
            actorTextColor: '#1d1c19',
            signalColor: '#1d1c19',
            signalTextColor: '#1d1c19',
            noteBkgColor: '#f2f1ec',
            noteBorderColor: '#dedcd3',
            noteTextColor: '#1d1c19',
            activationBkgColor: '#e3efed',
            activationBorderColor: '#1f5f5b',
            labelBoxBkgColor: '#f2f1ec',
            labelBoxBorderColor: '#dedcd3',
            loopTextColor: '#6b6960',
          },
          sequence: { mirrorActors: false, useMaxWidth: true, messageMargin: 32 },
          flowchart: { useMaxWidth: true, curve: 'basis' },
        });
        const result = await mermaid.render(id, chart.trim());
        if (!cancelled) setSvg(result.svg);
      } catch (e) {
        if (!cancelled) setFailed(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chart, id]);

  if (failed) {
    return (
      <pre className="overflow-x-auto rounded-lg border border-line bg-white p-4 font-mono text-xs text-muted">
        {chart.trim()}
      </pre>
    );
  }

  return (
    <figure
      role="img"
      aria-label={label}
      className="overflow-x-auto rounded-lg border border-line bg-white p-5 [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full"
    >
      {svg ? (
        <div dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <p className="py-10 text-center text-sm text-faint">Drawing diagram…</p>
      )}
    </figure>
  );
}
