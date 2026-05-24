import React from 'react';

function renderInline(text) {
  const parts = [];
  const regex = /\*\*(.+?)\*\*/g;
  let last = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    parts.push(<strong key={match.index} className="font-semibold">{match[1]}</strong>);
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
