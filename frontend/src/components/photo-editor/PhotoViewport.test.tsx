import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DEFAULT_EDITS } from '@/utils/imageEdit'
import { PhotoViewport } from './PhotoViewport'
import type { PhotoResource } from './imageResource'
vi.mock('@/components/ui', () => ({ Button: ({ children, variant: _variant, size: _size, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }) => <button {...props}>{children}</button> }))
class Pixels {
  colorSpace = 'srgb'
  data: Uint8ClampedArray
  width: number
  height: number
  constructor(data: Uint8ClampedArray, width: number, height: number) {
    this.data = data; this.width = width; this.height = height
  }
}
let frames: Map<number, FrameRequestCallback>, nextFrame: number, observeResize: () => void
const disconnect = vi.fn(), put = vi.fn(), draw = vi.fn()
const base: PhotoResource = { image: {} as ImageBitmap, width: 800, height: 600, dispose: vi.fn() }
function flush() { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(0)) }
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers(); frames = new Map(); nextFrame = 0
  vi.stubGlobal('ImageData', Pixels)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++nextFrame, callback); return nextFrame })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  vi.stubGlobal('ResizeObserver', class { constructor(callback: () => void) { observeResize = callback } observe() {} disconnect = disconnect })
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600)
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
    drawImage: draw, putImageData: put,
    getImageData: (_x: number, _y: number, width: number, height: number) => new Pixels(new Uint8ClampedArray(width * height * 4).fill(80), width, height),
  }) as unknown as CanvasRenderingContext2D)
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })
it('coalesces unpainted updates and restores full preview resolution after interaction', () => {
  const view = render(<PhotoViewport base={base} edit={{ ...DEFAULT_EDITS }} />)
  view.rerender(<PhotoViewport base={base} edit={{ ...DEFAULT_EDITS, exposure_ev: 1 }} />)
  act(flush)
  expect(put).toHaveBeenCalledTimes(1)
  const canvas = screen.getByRole('img')
  expect(canvas).toHaveAttribute('width', '512')
  expect(canvas).toHaveAttribute('data-preview-source', 'local-live')
  act(() => { vi.advanceTimersByTime(160); flush() })
  expect(canvas).toHaveAttribute('width', '800')
  expect(canvas).toHaveAttribute('height', '600')
  expect(canvas).toHaveAttribute('data-preview-source', 'local-refined')
  expect(put.mock.calls[1][0].data[0]).toBeGreaterThan(80)
})
it('fits and refits on ResizeObserver, supports zoom and returns to fit', () => {
  render(<PhotoViewport base={base} edit={{ ...DEFAULT_EDITS }} />)
  const canvas = screen.getByRole('img')
  expect(canvas).toHaveStyle({ width: '768px', height: '576px' })
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(424)
  act(observeResize)
  expect(canvas).toHaveStyle({ width: '400px', height: '300px' })
  fireEvent.change(screen.getByLabelText('缩放（相对适应）'), { target: { value: '2' } })
  expect(canvas).toHaveStyle({ width: '800px', height: '600px' })
  fireEvent.click(screen.getByRole('button', { name: '适应视口' }))
  expect(canvas).toHaveStyle({ width: '400px', height: '300px' })
})
it('displays authoritative server pixels without applying the edits twice', () => {
  const authoritative = { ...base, image: {} as ImageBitmap }
  render(<PhotoViewport base={base} authoritative={authoritative} edit={{ ...DEFAULT_EDITS, exposure_ev: 2 }} />)
  act(flush)
  expect(draw).toHaveBeenCalledExactlyOnceWith(authoritative.image, 0, 0)
  expect(put).not.toHaveBeenCalled()
  expect(screen.getByRole('img')).toHaveAttribute('data-preview-source', 'server')
})
it('cancels pending RAF, refinement and resize observation on unmount', () => {
  const view = render(<PhotoViewport base={base} edit={{ ...DEFAULT_EDITS }} />)
  view.unmount()
  expect(frames.size).toBe(0)
  expect(vi.getTimerCount()).toBe(0)
  expect(disconnect).toHaveBeenCalledOnce()
  expect(base.dispose).not.toHaveBeenCalled() // The loading hook owns this resource.
})
it.each([1,2,3])('keeps crop coordinates stable across zoom, ResizeObserver and DPR %s',dpr=>{
  vi.stubGlobal('devicePixelRatio',dpr)
  const edit={...DEFAULT_EDITS,schema_version:2 as const,geometry:{rotation_quadrants:1,flip_horizontal:false,flip_vertical:false,crop:{x:0.1,y:0.2,width:0.5,height:0.6}}}
  const crop={rect:edit.geometry.crop,ratio:null},change=vi.fn()
  const view=render(<PhotoViewport base={base} edit={edit} crop={crop} onCropChange={change} onCropCancel={vi.fn()}/>)
  const selection=screen.getByRole('group',{name:'裁剪框'}).querySelector('[data-handle="move"]')
  expect(selection).toHaveStyle({left:'10%',top:'20%',width:'50%',height:'60%'})
  fireEvent.change(screen.getByLabelText('缩放（相对适应）'),{target:{value:'2'}})
  vi.stubGlobal('devicePixelRatio',3)
  vi.spyOn(HTMLElement.prototype,'clientWidth','get').mockReturnValue(424)
  act(observeResize)
  expect(selection).toHaveStyle({left:'10%',top:'20%',width:'50%',height:'60%'})
  expect(change).not.toHaveBeenCalled()
  view.rerender(<PhotoViewport base={base} edit={edit}/>)
  act(flush)
  expect(screen.queryByRole('group',{name:'裁剪框'})).not.toBeInTheDocument()
  // Canonical rotated 600x800 -> crop [60,160,360,640] = 300x480.
  const canvas=screen.getByRole('img')
  expect(parseFloat(canvas.style.width)/parseFloat(canvas.style.height)).toBeCloseTo(300/480,12)
})
