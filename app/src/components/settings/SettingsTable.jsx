import { useState, useMemo, Fragment } from 'react';
import { Search, ChevronUp, ChevronDown } from 'lucide-react';

/**
 * SettingsTable — shared sortable / filterable / searchable table for settings panels.
 *
 * columns      { key, label, sortable?, render?: (row) => ReactNode, width? }[]
 * rows         any[]
 * rowKey       string field used as unique key (default 'id')
 * searchKeys   string[] — fields the search input filters across
 * filters      { key, label, options: { value, label }[] }[] — dropdown column filters
 * actions      (row) => ReactNode — rendered in a hover-only rightmost cell
 * rowDetail    (row, collapse: () => void) => ReactNode — expandable inline detail
 * emptyMessage string
 * searchPlaceholder string
 */
export default function SettingsTable({
  columns = [],
  rows = [],
  rowKey = 'id',
  searchKeys = [],
  searchPlaceholder = 'Search…',
  filters = [],
  actions,
  rowDetail,
  emptyMessage = 'No results',
}) {
  const [q, setQ]             = useState('');
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [filterVals, setFilterVals] = useState({});
  const [expandedKey, setExpandedKey] = useState(null);

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  }

  const visible = useMemo(() => {
    let r = [...rows];

    if (q.trim()) {
      const lq = q.toLowerCase();
      r = r.filter(row =>
        searchKeys.some(k => String(row[k] ?? '').toLowerCase().includes(lq))
      );
    }

    for (const [fk, fv] of Object.entries(filterVals)) {
      if (fv) r = r.filter(row => String(row[fk] ?? '') === fv);
    }

    if (sortKey) {
      r.sort((a, b) => {
        const av = a[sortKey] ?? '';
        const bv = b[sortKey] ?? '';
        const cmp =
          typeof av === 'number' && typeof bv === 'number'
            ? av - bv
            : String(av).localeCompare(String(bv));
        return sortDir === 'asc' ? cmp : -cmp;
      });
    }

    return r;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q, filterVals, sortKey, sortDir, searchKeys]);

  const colSpan = columns.length + (actions ? 1 : 0);

  return (
    <div className="space-y-3">
      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      {(searchKeys.length > 0 || filters.length > 0) && (
        <div className="flex items-center gap-2 flex-wrap">
          {searchKeys.length > 0 && (
            <div className="relative flex-1 min-w-[160px]">
              <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
              <input
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full bg-surface-2 border border-border rounded-lg pl-8 pr-3 py-2 text-sm text-gray-200 placeholder-gray-600 outline-none focus:border-accent/50"
              />
            </div>
          )}
          {filters.map(f => (
            <select
              key={f.key}
              value={filterVals[f.key] || ''}
              onChange={e => setFilterVals(prev => ({ ...prev, [f.key]: e.target.value }))}
              className="bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-gray-400 outline-none focus:border-accent/50 cursor-pointer"
            >
              <option value="">{f.label}: All</option>
              {f.options.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          ))}
        </div>
      )}

      {/* ── Table ───────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-surface-2">
              {columns.map(col => (
                <th
                  key={col.key}
                  style={col.width ? { width: col.width } : undefined}
                  onClick={col.sortable ? () => toggleSort(col.key) : undefined}
                  className={`px-4 py-2.5 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-widest border-b border-border whitespace-nowrap ${
                    col.sortable ? 'cursor-pointer hover:text-gray-300 select-none' : ''
                  }`}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {col.sortable && sortKey === col.key && (
                      sortDir === 'asc'
                        ? <ChevronUp size={9} className="text-accent" />
                        : <ChevronDown size={9} className="text-accent" />
                    )}
                  </span>
                </th>
              ))}
              {actions && (
                <th className="px-3 border-b border-border w-px" />
              )}
            </tr>
          </thead>

          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={colSpan} className="px-4 py-8 text-center text-sm text-gray-600">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              visible.map(row => {
                const key = row[rowKey];
                const isExpanded = expandedKey === key;
                return (
                  <Fragment key={key}>
                    <tr
                      onClick={rowDetail ? () => setExpandedKey(isExpanded ? null : key) : undefined}
                      className={`border-t border-border first:border-t-0 group transition-colors hover:bg-surface-2/40 ${
                        rowDetail ? 'cursor-pointer' : ''
                      }`}
                    >
                      {columns.map(col => (
                        <td key={col.key} className="px-4 py-2.5">
                          {col.render
                            ? col.render(row)
                            : (
                              <span className="text-sm text-gray-300 truncate block">
                                {String(row[col.key] ?? '—')}
                              </span>
                            )
                          }
                        </td>
                      ))}
                      {actions && (
                        <td
                          className="px-3 py-2.5 text-right whitespace-nowrap"
                          onClick={e => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            {actions(row)}
                          </div>
                        </td>
                      )}
                    </tr>

                    {rowDetail && isExpanded && (
                      <tr className="border-t border-border">
                        <td colSpan={colSpan} className="p-0 bg-surface-2/20">
                          {rowDetail(row, () => setExpandedKey(null))}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
