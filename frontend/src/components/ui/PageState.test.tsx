import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LoadingState, ErrorState } from './PageState'
import { ListItem } from './ListItem'

describe('page feedback and pending actions',()=>{
  it('names the loading status and supports its default label',()=>{
    const {rerender}=render(<LoadingState/>); expect(screen.getByRole('status')).toHaveAccessibleName('加载中')
    rerender(<LoadingState label="正在加载照片"/>); expect(screen.getByRole('status')).toHaveAccessibleName('正在加载照片')
  })
  it('announces failures and retries only when an action is supplied',async()=>{
    const retry=vi.fn(); const user=userEvent.setup(); const {rerender}=render(<ErrorState/>);
    expect(screen.getByRole('alert')).toHaveTextContent('加载失败'); expect(screen.queryByRole('button')).not.toBeInTheDocument()
    rerender(<ErrorState title="照片加载失败" onRetry={retry}/>); await user.click(screen.getByRole('button',{name:'重试'})); expect(retry).toHaveBeenCalledOnce()
  })
  it('disables native list buttons while an action is pending',async()=>{
    const click=vi.fn(); const user=userEvent.setup(); const {rerender}=render(<ListItem title="确认" onClick={click} disabled aria-busy="true" isLast/>);
    const button=screen.getByRole('button',{name:'确认'}); expect(button).toBeDisabled(); await user.click(button); expect(click).not.toHaveBeenCalled()
    rerender(<ListItem title="确认" onClick={click} isLast/>); await user.click(button); expect(click).toHaveBeenCalledOnce()
  })
})
