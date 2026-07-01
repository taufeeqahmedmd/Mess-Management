"use client";

import { useState } from "react";
import { useDismiss } from "@/components/shell/hooks";

/**
 * Single-select searchable dropdown (creatable). Renders a text input that
 * submits under `name`, with a visible chevron and a filterable option panel —
 * type to filter the managed options, click one to pick it, or type a value not
 * in the list (free text is preserved). Used for the food-request delivery
 * location, whose options are managed in Settings → Delivery Locations.
 */
export function SearchSelect({
  name,
  options,
  defaultValue = "",
  placeholder = "Search or select…",
  required = false,
  ariaLabel,
  inputClassName = "",
  maxLength,
}: {
  name: string;
  options: string[];
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
  ariaLabel: string;
  inputClassName?: string;
  maxLength?: number;
}) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const ref = useDismiss<HTMLDivElement>(open, () => setOpen(false));
  const listId = `${name}-listbox`;

  const q = value.trim().toLowerCase();
  const filtered = q ? options.filter((o) => o.toLowerCase().includes(q)) : options;

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <input
          name={name}
          required={required}
          value={value}
          maxLength={maxLength}
          onChange={(e) => {
            setValue(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          aria-label={ariaLabel}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          className={`${inputClassName} pr-9`}
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label={open ? "Close options" : "Open options"}
          onClick={() => setOpen((v) => !v)}
          className="absolute inset-y-0 right-0 grid w-9 place-items-center text-muted"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`size-4 transition-transform ${open ? "rotate-180" : ""}`}>
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </div>

      {open && filtered.length > 0 ? (
        <div id={listId} role="listbox" aria-label={ariaLabel} className="absolute z-50 mt-1.5 max-h-56 w-full overflow-auto rounded-md border border-line bg-surface p-1 shadow-lg">
          {filtered.map((o) => (
            <button
              key={o}
              type="button"
              role="option"
              aria-selected={o === value}
              onClick={() => {
                setValue(o);
                setOpen(false);
              }}
              className={`flex w-full items-center rounded-sm px-2.5 py-2 text-left text-sm transition-colors ${o === value ? "bg-gold-soft text-ink" : "text-ink-2 hover:bg-gold/10"}`}
            >
              {o}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
