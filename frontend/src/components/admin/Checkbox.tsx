"use client";

export function Checkbox({ checked, onChange, id }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  id?: string;
}) {
  return (
    <input
      type="checkbox"
      id={id}
      checked={checked}
      onChange={e => onChange(e.target.checked)}
      className="w-4 h-4 rounded border-neutral-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
    />
  );
}
