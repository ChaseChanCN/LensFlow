import { useId, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes, type ReactNode, type Ref } from 'react'

type FieldVariant = 'default' | 'grouped'
interface FieldProps { label?: string; error?: string; variant?: FieldVariant }

const VARIANTS = {
  default: 'rounded-control border border-separator-opaque bg-surface-primary px-3.5 py-2.5',
  grouped: 'rounded-none border-0 bg-transparent p-0',
}
function fieldClass(variant: FieldVariant, error: string | undefined, className: string) {
  return `w-full text-body-sm text-label transition-shadow duration-[var(--duration-fast)] placeholder:text-label-muted disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 ${VARIANTS[variant]} ${error ? 'border-error-label focus-visible:outline-error-label' : 'focus-visible:outline-action-primary-strong'} ${className}`
}
function useField(id: string | undefined, name: string | undefined, error: string | undefined, describedBy: string | undefined) {
  const generatedId = useId()
  const inputId = id ?? name ?? generatedId
  const errorId = `${inputId}-error`
  return { inputId, errorId, describedBy: [describedBy, error ? errorId : undefined].filter(Boolean).join(' ') || undefined }
}
function FieldLabel({ label, inputId }: { label?: string; inputId: string }) {
  return label ? <label htmlFor={inputId} className="block text-form-label font-medium text-label">{label}</label> : null
}
function FieldError({ error, id }: { error?: string; id: string }) {
  return error ? <p id={id} role="alert" className="text-caption text-error-label">{error}</p> : null
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement>, FieldProps { ref?: Ref<HTMLInputElement> }
export function Input({ label, error, variant = 'default', className = '', id, 'aria-describedby': describedBy, 'aria-invalid': invalid, ...props }: InputProps) {
  const field = useField(id, props.name, error, describedBy)
  return (
    <div className="space-y-1.5">
      <FieldLabel label={label} inputId={field.inputId} />
      <input {...props} id={field.inputId} aria-describedby={field.describedBy} aria-invalid={error ? true : invalid} className={fieldClass(variant, error, className)} />
      <FieldError error={error} id={field.errorId} />
    </div>
  )
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement>, FieldProps { children: ReactNode; ref?: Ref<HTMLSelectElement> }
export function Select({ label, error, variant = 'default', className = '', id, children, 'aria-describedby': describedBy, 'aria-invalid': invalid, ...props }: SelectProps) {
  const field = useField(id, props.name, error, describedBy)
  return (
    <div className="space-y-1.5">
      <FieldLabel label={label} inputId={field.inputId} />
      <select {...props} id={field.inputId} aria-describedby={field.describedBy} aria-invalid={error ? true : invalid} className={fieldClass(variant, error, className)}>{children}</select>
      <FieldError error={error} id={field.errorId} />
    </div>
  )
}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement>, FieldProps { ref?: Ref<HTMLTextAreaElement> }
export function Textarea({ label, error, variant = 'default', className = '', id, 'aria-describedby': describedBy, 'aria-invalid': invalid, ...props }: TextareaProps) {
  const field = useField(id, props.name, error, describedBy)
  return (
    <div className="space-y-1.5">
      <FieldLabel label={label} inputId={field.inputId} />
      <textarea {...props} id={field.inputId} aria-describedby={field.describedBy} aria-invalid={error ? true : invalid} className={fieldClass(variant, error, className)} />
      <FieldError error={error} id={field.errorId} />
    </div>
  )
}
