import React, { useState, useEffect, useRef } from 'react';

interface NumericInputProps {
  /** Current committed value. `undefined` means the field is empty/unset. */
  value: number | undefined;
  /** Called on blur with the parsed+clamped value, or `undefined` if the field was left empty. */
  onChange: (value: number | undefined) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Round to nearest integer on commit. */
  integer?: boolean;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * A numeric input that keeps a local string buffer while the user is typing.
 * This prevents the field from snapping to a clamped/parsed value mid-edit,
 * which broke backspace-to-clear workflows when onChange did immediate clamping.
 *
 * - Typing and backspace work freely.
 * - On blur (or Enter), the raw string is parsed, clamped to [min, max], and committed.
 * - If the field is empty on blur, `onChange(undefined)` is called.
 * - External `value` changes (e.g. from a different UI) are reflected when the field is unfocused.
 */
export function NumericInput({
  value,
  onChange,
  min,
  max,
  step,
  integer = false,
  placeholder,
  className,
  disabled,
}: NumericInputProps) {
  const [raw, setRaw] = useState<string>(value !== undefined ? String(value) : '');
  const focused = useRef(false);

  // Sync external value changes when not actively editing
  useEffect(() => {
    if (!focused.current) {
      setRaw(value !== undefined ? String(value) : '');
    }
  }, [value]);

  const commit = () => {
    focused.current = false;
    const trimmed = raw.trim();
    if (trimmed === '' || trimmed === '-') {
      onChange(undefined);
      return;
    }
    const parsed = parseFloat(trimmed);
    if (!isFinite(parsed)) {
      // Revert to last committed value
      setRaw(value !== undefined ? String(value) : '');
      return;
    }
    let result = integer ? Math.round(parsed) : parsed;
    if (min !== undefined) result = Math.max(min, result);
    if (max !== undefined) result = Math.min(max, result);
    onChange(result);
    setRaw(String(result));
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      value={raw}
      placeholder={placeholder}
      className={className}
      disabled={disabled}
      step={step}
      onChange={e => setRaw(e.target.value)}
      onFocus={() => { focused.current = true; }}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
    />
  );
}
