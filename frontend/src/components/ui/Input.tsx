import { type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes, type ReactNode } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export function Input({ label, error, className = '', id, ...props }: InputProps) {
  const inputId = id || props.name
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-label-secondary">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={`w-full rounded-control border border-separator-opaque bg-system-bg px-3.5 py-2.5 text-sm text-label transition-all duration-150 placeholder:text-label-tertiary focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent/20 ${error ? 'border-error focus:border-error focus:ring-error/20' : ''} ${className}`}
        {...props}
      />
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  )
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  children: ReactNode
}

export function Select({ label, error, className = '', id, children, ...props }: SelectProps) {
  const selectId = id || props.name
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={selectId} className="block text-sm font-medium text-label-secondary">
          {label}
        </label>
      )}
      <select
        id={selectId}
        className={`w-full rounded-control border border-separator-opaque bg-system-bg px-3.5 py-2.5 text-sm text-label transition-all duration-150 focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent/20 ${error ? 'border-error focus:border-error focus:ring-error/20' : ''} ${className}`}
        {...props}
      >
        {children}
      </select>
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  )
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
}

export function Textarea({ label, error, className = '', id, ...props }: TextareaProps) {
  const textareaId = id || props.name
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={textareaId} className="block text-sm font-medium text-label-secondary">
          {label}
        </label>
      )}
      <textarea
        id={textareaId}
        className={`w-full rounded-control border border-separator-opaque bg-system-bg px-3.5 py-2.5 text-sm text-label transition-all duration-150 placeholder:text-label-tertiary focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent/20 ${error ? 'border-error focus:border-error focus:ring-error/20' : ''} ${className}`}
        {...props}
      />
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  )
}
