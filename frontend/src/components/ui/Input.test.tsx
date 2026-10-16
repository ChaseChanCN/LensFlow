import { createRef } from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Input, Select, Textarea } from './Input'

describe.each(['input', 'select', 'textarea'] as const)('%s fields', (kind) => {
  function Field(props: { label?: string; id?: string; name?: string; error?: string; variant?: 'default' | 'grouped'; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) {
    return kind === 'input' ? <Input {...props} /> : kind === 'select' ? <Select {...props}><option value="portrait">人像</option></Select> : <Textarea {...props} />
  }
  it('associates labels without requiring an id or name and generates unique ids', async () => {
    render(<><Field label="字段一" /><Field label="字段二" variant="grouped" /></>)
    const first = screen.getByLabelText('字段一')
    const second = screen.getByLabelText('字段二')
    expect(first.id).not.toBe(second.id)
    await userEvent.click(screen.getByText('字段二'))
    expect(second).toHaveFocus()
  })
  it('preserves caller descriptions, wires errors, and clears invalid state', () => {
    const { rerender } = render(<><p id="hint">必填</p><Field label="字段" id="field" name="fallback" error="请填写" aria-describedby="hint" /></>)
    const input = screen.getByLabelText('字段')
    expect(input).toHaveAttribute('id', 'field')
    expect(input).toHaveAttribute('aria-describedby', 'hint field-error')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toHaveAttribute('id', 'field-error')
    rerender(<Field label="字段" id="field" aria-invalid={false} />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByLabelText('字段')).toHaveAttribute('aria-invalid', 'false')
    expect(screen.getByLabelText('字段')).not.toHaveAttribute('aria-describedby')
  })
  it('supports name-based ids, unlabeled native aria names, and grouped errors', () => {
    render(<Field name="email" error="校验失败" variant="grouped" />)
    expect(document.getElementById('email')).toHaveAttribute('aria-describedby', 'email-error')
  })
})

it('forwards native field refs and input events', async () => {
  const input = createRef<HTMLInputElement>()
  const select = createRef<HTMLSelectElement>()
  const textarea = createRef<HTMLTextAreaElement>()
  render(<><Input ref={input} aria-label="姓名" /><Select ref={select} aria-label="类型"><option>人像</option></Select><Textarea ref={textarea} aria-label="备注" /></>)
  await userEvent.type(screen.getByLabelText('姓名'), 'Chase')
  expect(input.current).toHaveValue('Chase')
  expect(select.current).toBe(screen.getByLabelText('类型'))
  expect(textarea.current).toBe(screen.getByLabelText('备注'))
})
