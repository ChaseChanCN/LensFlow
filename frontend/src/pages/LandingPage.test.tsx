import { expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { LandingPage } from './LandingPage'
const navigate=vi.fn()
vi.mock('react-router-dom',()=>({useNavigate:()=>navigate}))
it('names its iframe and landmark and only accepts local known navigation messages',()=>{
  navigate.mockReset();render(<LandingPage/>);expect(screen.getByRole('main')).toBeInTheDocument();expect(screen.getByTitle('LensFlow')).toHaveAttribute('src','/lensflow-v24.html')
  act(()=>window.dispatchEvent(new MessageEvent('message',{origin:'https://example.net',data:{type:'navigate',path:'/client'}})))
  act(()=>window.dispatchEvent(new MessageEvent('message',{origin:location.origin,data:{type:'navigate',path:'/unexpected'}})))
  expect(navigate).not.toHaveBeenCalled()
  act(()=>window.dispatchEvent(new MessageEvent('message',{origin:location.origin,data:{type:'navigate',path:'/client'}})))
  expect(navigate).toHaveBeenCalledExactlyOnceWith('/client')
})
