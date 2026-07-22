"use client";

import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";

export type MemberOption = { id: string; name: string; email: string };

type Props = {
  onSelect: (member: MemberOption) => void;
  disabled?: boolean;
};

export function MemberSearch({ onSelect, disabled }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MemberOption[]>([]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<MemberOption | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (selected) return;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (!query.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }
    timeoutRef.current = setTimeout(async () => {
      const res = await fetch(`/api/members/search?q=${encodeURIComponent(query)}`);
      if (!res.ok) return;
      const data = await res.json();
      setResults(data.members ?? []);
      setOpen(true);
    }, 300);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [query, selected]);

  function handleSelect(member: MemberOption) {
    setSelected(member);
    setQuery(member.name);
    setResults([]);
    setOpen(false);
    onSelect(member);
  }

  function handleClear() {
    setSelected(null);
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)] pointer-events-none"
        />
        <input
          type="text"
          placeholder="Search member name…"
          value={query}
          onChange={(e) => {
            if (selected) handleClear();
            setQuery(e.target.value);
          }}
          disabled={disabled}
          autoComplete="off"
          className="w-full pl-9 pr-4 py-2.5 rounded-full border border-[var(--border)] bg-[var(--bg-cream)]/30 text-sm focus:outline-2 focus:outline-[var(--gold)] focus:outline-offset-2 disabled:opacity-50"
        />
        {selected && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--bg-dark)] text-lg leading-none"
            aria-label="Clear selection"
          >
            ×
          </button>
        )}
      </div>

      {open && results.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full bg-white border border-[var(--border)] rounded-xl shadow-lg overflow-hidden">
          {results.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onMouseDown={() => handleSelect(m)}
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-[var(--bg-cream)] flex flex-col"
              >
                <span className="font-medium text-[var(--bg-dark)]">{m.name}</span>
                <span className="text-[var(--muted)] text-xs">{m.email}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && results.length === 0 && query.trim() && !selected && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-[var(--border)] rounded-xl shadow-lg px-4 py-3 text-sm text-[var(--muted)]">
          No members found.
        </div>
      )}
    </div>
  );
}
