import { expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { LandingPage } from './LandingPage'
import '@/test-effects-mocks'
const navigate=vi.fn()
vi.mock('react-router-dom',async original=>({...await original<typeof import('react-router-dom')>(),useNavigate:()=>navigate}))
it('renders the material homepage with named navigation actions',async()=>{
  navigate.mockReset();render(<MemoryRouter><LandingPage/></MemoryRouter>)
  expect(screen.getByRole('main')).toBeInTheDocument()
  expect(screen.getByRole('heading',{level:1})).toHaveTextContent('每一次拍摄')
  expect(screen.getByTitle('人物粒子肖像')).toHaveAttribute('src','/lensflow-v24.html?portrait=hero')
  await userEvent.click(screen.getByRole('button',{name:/开启创作空间/}))
  expect(navigate).toHaveBeenCalledWith('/login')
})
