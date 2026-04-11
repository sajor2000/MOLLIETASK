"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
}

export function SearchInput({ value, onChange }: SearchInputProps) {
  const [localValue, setLocalValue] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  function handleChange(newValue: string) {
    setLocalValue(newValue);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onChange(newValue), 200);
  }

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return (
    <div className="relative flex items-center">
      <Icon
        name="search"
        className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted"
      />
      <input
        type="text"
        value={localValue}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Search tasks..."
        className="bg-bg-base border border-outline-variant/10 rounded-[4px] pl-9 pr-8 py-2 text-[13px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors duration-200 w-full md:w-48"
      />
      {localValue && (
        <button
          onClick={() => { setLocalValue(""); onChange(""); clearTimeout(timerRef.current); }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
          aria-label="Clear search"
        >
          <Icon name="close" className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
