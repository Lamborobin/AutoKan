import React from 'react';

function renderInline(text) {
  const parts = [];
  const regex = /\*\*(.+?)\*\*|`([^`]+)`/g;
  let last = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    parts.push(match[1] !== undefined
      ? <strong key={match.index} className="font-semibold">{match[1]}</strong>
      : <code key={match.index} className="font-mono text-[0.95em] px-1 rounded bg-surface-3 text-gray-300">{match[2]}</code>);
    last = regex.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length ? parts : text;
}

function isListItem(line) {
  return /^[•\-\*] /.test(line) || /^\d+\. /.test(line);
}

function isOrderedItem(line) {
  return /^\d+\. /.test(line);
}

function stripListMarker(line) {
  return line.replace(/^[•\-\*] /, '').replace(/^\d+\. /, '');
}

export default function MarkdownText({ text, className = '' }) {
  if (!text) return null;

  const lines = text.split('\n');
  const nodes = [];
  let i = 0;
  let keyCounter = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === '') {
      i++;
      continue;
    }

    if (line.trim().startsWith('```')) {
      const code = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) code.push(lines[i++]);
      i++; // closing fence
      nodes.push(
        <pre key={keyCounter++} className="font-mono text-[0.95em] bg-surface-3 border border-border rounded-md px-2.5 py-2 overflow-x-auto whitespace-pre text-gray-300">
          {code.join('\n')}
        </pre>
      );
      continue;
    }

    if (isListItem(line)) {
      const ordered = isOrderedItem(line);
      const items = [];
      while (i < lines.length && (isListItem(lines[i]) || lines[i].trim() === '')) {
        if (lines[i].trim() === '') { i++; continue; }
        const trimmed = lines[i].trim();
        if (isOrderedItem(trimmed)) {
          const m = trimmed.match(/^(\d+)\.\s+(.*)/);
          items.push(
            <li key={i} className="flex gap-1.5">
              <span className="shrink-0 tabular-nums">{m ? m[1] : '1'}.</span>
              <span>{renderInline(m ? m[2] : stripListMarker(trimmed))}</span>
            </li>
          );
        } else {
          items.push(
            <li key={i} className="flex gap-1.5">
              <span className="shrink-0">•</span>
              <span>{renderInline(stripListMarker(trimmed))}</span>
            </li>
          );
        }
        i++;
      }
      if (ordered) {
        nodes.push(
          <ul key={keyCounter++} className="space-y-0.5 pl-0">
            {items}
          </ul>
        );
      } else {
        nodes.push(
          <ul key={keyCounter++} className="space-y-0.5 pl-0">
            {items}
          </ul>
        );
      }
      continue;
    }

    nodes.push(<p key={keyCounter++}>{renderInline(line)}</p>);
    i++;
  }

  return <div className={`space-y-1.5 ${className}`}>{nodes}</div>;
}
