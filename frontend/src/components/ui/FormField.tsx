"use client";
import { type FieldError, type UseFormRegisterReturn } from "react-hook-form";

interface FormFieldProps {
  label: string;
  error?: FieldError;
  required?: boolean;
  children: React.ReactNode;
  hint?: string;
  id?: string;
}

export function FormField({ label, error, required, children, hint, id }: FormFieldProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-neutral-700">
        {label}
        {required && <span className="text-error-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-neutral-400">{hint}</p>}
      {error && <p className="text-xs text-error-600 flex items-center gap-1">{error.message}</p>}
    </div>
  );
}

interface InputFieldProps {
  label: string;
  registration: UseFormRegisterReturn;
  error?: FieldError;
  required?: boolean;
  type?: string;
  placeholder?: string;
  hint?: string;
  rows?: number;
  id?: string;
}

export function InputField({ label, registration, error, required, type = "text", placeholder, hint, rows, id }: InputFieldProps) {
  const Tag = rows ? "textarea" : "input";
  const base = "w-full bg-white border rounded-lg px-3 py-2.5 text-sm placeholder-neutral-400 transition-all duration-150 focus:outline-none focus:ring-2";
  const border = error ? "border-error-300 focus:border-error-500 focus:ring-error-500/10" : "border-neutral-200 focus:border-brand-500 focus:ring-brand-500/10";

  return (
    <FormField label={label} error={error} required={required} hint={hint} id={id}>
      <Tag
        id={id}
        {...registration}
        type={type}
        placeholder={placeholder}
        rows={rows}
        className={`${base} ${border} ${Tag === "textarea" ? "resize-y min-h-[80px]" : ""}`}
      />
    </FormField>
  );
}

interface SelectFieldProps {
  label: string;
  registration: UseFormRegisterReturn;
  error?: FieldError;
  required?: boolean;
  placeholder?: string;
  options: { value: string; label: string }[];
  id?: string;
}

export function SelectField({ label, registration, error, required, placeholder, options, id }: SelectFieldProps) {
  const base = "w-full bg-white border rounded-lg px-3 py-2.5 text-sm transition-all duration-150 focus:outline-none focus:ring-2";
  const border = error ? "border-error-300 focus:border-error-500 focus:ring-error-500/10" : "border-neutral-200 focus:border-brand-500 focus:ring-brand-500/10";

  return (
    <FormField label={label} error={error} required={required} id={id}>
      <select id={id} {...registration} className={`${base} ${border}`}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </FormField>
  );
}
