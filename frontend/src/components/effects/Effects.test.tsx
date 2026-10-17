import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import '@/test-effects-mocks'
import { AnalysisActivity, BeamSurface, MetalSurface } from './EffectSurfaces'
import { QuickActions } from './QuickActions'
import { beamThemeTuning, BEAM_COLORS, BEAM_SIZES, choose, METAL_PRESETS, randomBeam } from './presets'
import { EffectBoundary } from './EffectBoundary'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

function motion(initial = false) {
  const query = new EventTarget() as EventTarget & { matches: boolean }
  query.matches = initial
  vi.stubGlobal('matchMedia', () => query)
  return query
}

describe('effects pilot adapters', () => {
  it('does not initialize an effect when disabled and preserves the button when toggled', async () => {
    motion()
    const frames = vi.spyOn(window,'requestAnimationFrame')
    const {container,rerender} = render(<BeamSurface enabled={false}><button>普通操作</button></BeamSurface>)
    const button=screen.getByRole('button',{name:'普通操作'})
    expect(container.querySelector('.effects-surface-overlay')).toBeNull()
    expect(container.querySelector('[data-beam-size]')).toBeNull()
    expect(frames).not.toHaveBeenCalled()
    rerender(<BeamSurface enabled><button>普通操作</button></BeamSurface>)
    await screen.findByTestId('beam-renderer')
    expect(screen.getByRole('button',{name:'普通操作'})).toBe(button)
    rerender(<BeamSurface enabled={false}><button>普通操作</button></BeamSurface>)
    expect(container.querySelector('.effects-surface-overlay')).toBeNull()
    expect(screen.queryByTestId('beam-renderer')).not.toBeInTheDocument()
    expect(screen.getByRole('button',{name:'普通操作'})).toBe(button)
  })
  it('uses a silver blue decorative renderer only in light mode', () => {
    const light=beamThemeTuning('light'), dark=beamThemeTuning('dark')
    expect(light.glowSize).toBe(1)
    expect(light.brightness).toBe(dark.brightness)
    expect(light.style).toEqual({filter:'brightness(0) saturate(100%) invert(78%) sepia(18%) saturate(430%) hue-rotate(176deg) brightness(95%) contrast(92%)'})
    expect(dark.style).toEqual({})
  })
  it.each(BEAM_SIZES.map((size,index) => ({size,random:(index+.5)/BEAM_SIZES.length})))('can draw $size on a fresh mount, always in mono', ({size,random}) => {
    vi.spyOn(Math,'random').mockReturnValue(random)
    expect(randomBeam()).toEqual({size,colorVariant:'mono'})
  })
  it('draws a new shape on remount but keeps it during rerenders', () => {
    motion()
    const random = vi.spyOn(Math,'random').mockReturnValue(0)
    const {container,rerender} = render(<BeamSurface key="first"><button>操作</button></BeamSurface>)
    expect(container.firstChild).toHaveAttribute('data-beam-size','md')
    random.mockReturnValue(.99)
    rerender(<BeamSurface key="first"><button>已更新</button></BeamSurface>)
    expect(container.firstChild).toHaveAttribute('data-beam-size','md')
    rerender(<BeamSurface key="new-mount"><button>新实例</button></BeamSurface>)
    expect(container.firstChild).toHaveAttribute('data-beam-size','pulse-outside')
    expect(container.firstChild).toHaveAttribute('data-beam-color','mono')
  })
  it.each([{ Surface: BeamSurface, renderer: 'beam-renderer' }, { Surface: MetalSurface, renderer: 'metal-renderer' }])('keeps the real button mounted while $renderer initializes', async ({ Surface, renderer }) => {
    motion()
    const clicked = vi.fn()
    const user = userEvent.setup()
    render(<Surface><button onClick={clicked}>立即操作</button></Surface>)
    const button = screen.getByRole('button', { name: '立即操作' })
    button.focus()
    await screen.findByTestId(renderer)
    expect(screen.getByRole('button', { name: '立即操作' })).toBe(button)
    expect(button).toHaveFocus()
    await user.click(button)
    expect(clicked).toHaveBeenCalledOnce()
    expect(document.querySelectorAll('button')).toHaveLength(1)
  })
  it('chooses the first and last supported options within bounds', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0)
    for (const choices of [BEAM_SIZES, BEAM_COLORS, METAL_PRESETS]) expect(choose<string>(choices)).toBe(choices[0])
    random.mockReturnValue(0.999999)
    for (const choices of [BEAM_SIZES, BEAM_COLORS, METAL_PRESETS]) expect(choose<string>(choices)).toBe(choices.at(-1))
  })
  it('keeps random presets and fixed strength stable across rerenders', async () => {
    motion()
    const random = vi.spyOn(Math, 'random').mockReturnValue(0)
    const { rerender } = render(<><BeamSurface><p>first</p></BeamSurface><MetalSurface><button>save</button></MetalSurface></>)
    const beam = await screen.findByTestId('beam-renderer')
    const metal = await screen.findByTestId('metal-renderer')
    expect(beam).toHaveAttribute('data-size', 'md'); expect(beam).toHaveAttribute('data-color', 'mono')
    expect(metal).toHaveAttribute('data-preset', 'chromatic')
    random.mockReturnValue(0.99)
    rerender(<><BeamSurface><p>updated</p></BeamSurface><MetalSurface><button>saved</button></MetalSurface></>)
    expect(beam).toHaveAttribute('data-size', 'md'); expect(metal).toHaveAttribute('data-preset', 'chromatic')
    expect(beam).toHaveAttribute('data-strength', '0.7'); expect(metal).toHaveAttribute('data-strength', '0.7')
  })
  it('updates motion preferences and removes subscriptions on unmount', async () => {
    const query = motion()
    const remove = vi.spyOn(query, 'removeEventListener')
    const { unmount } = render(<><BeamSurface><p>beam</p></BeamSurface><MetalSurface><button>metal</button></MetalSurface><AnalysisActivity label="读取分析" /></>)
    await screen.findByTestId('orb-renderer')
    act(() => { query.matches = true; query.dispatchEvent(new Event('change')) })
    expect(screen.getByTestId('beam-renderer')).toHaveAttribute('data-active', 'false')
    expect(screen.getByTestId('metal-renderer')).toHaveAttribute('data-paused', 'true')
    expect(screen.getByTestId('orb-renderer')).toHaveAttribute('data-paused', 'true')
    expect(screen.getByRole('status')).toHaveTextContent('读取分析')
    unmount(); expect(remove).toHaveBeenCalledTimes(3)
  })
  it('pauses when the page is hidden', async () => {
    motion()
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
    render(<MetalSurface><button>save</button></MetalSurface>)
    await screen.findByTestId('metal-renderer')
    act(() => { hidden.mockReturnValue(true); document.dispatchEvent(new Event('visibilitychange')) })
    expect(screen.getByTestId('metal-renderer')).toHaveAttribute('data-paused', 'true')
  })
  it('preserves the underlying control on renderer failure', () => {
    const Throw = () => { throw new Error('renderer unavailable') }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<EffectBoundary fallback={<button>fallback save</button>}><Throw /></EffectBoundary>)
    expect(screen.getByRole('button', { name: 'fallback save' })).toBeEnabled()
  })
  it('shows named shortcuts immediately and navigates with one click', async () => {
    motion(); const user = userEvent.setup()
    render(<MemoryRouter><Routes><Route path="/" element={<QuickActions />} /><Route path="/orders" element={<h1>订单目标</h1>} /></Routes></MemoryRouter>)
    const orders = await screen.findByRole('button', { name: '查看订单' })
    expect(screen.getByRole('button', { name: '新建预约' })).toBeVisible()
    expect(screen.queryByRole('button', { name: '展开快捷操作' })).not.toBeInTheDocument()
    await user.click(orders)
    expect(screen.getByRole('heading', { name: '订单目标' })).toBeInTheDocument()
  })
  it('provides static actions with reduced motion enabled', async () => {
    motion(true)
    render(<MemoryRouter><QuickActions /></MemoryRouter>)
    expect(screen.getByRole('button', { name: '查看订单' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: '展开快捷操作' })).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: '新建预约' })).toBeEnabled())
  })
})
