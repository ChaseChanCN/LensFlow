import { useState } from 'react'
import { fireEvent,render,screen } from '@testing-library/react'
import { afterEach,beforeEach,expect,it,vi } from 'vitest'
import { DEFAULT_EDITS,type ImageEdits } from '@/utils/imageEdit'
import { identityGeometry,aspectCrop,type CropRect } from '@/utils/imageGeometry'
import { CropOverlay } from './CropOverlay'
import { GeometryPanel,type CropSession } from './GeometryPanel'
import { useEditHistory } from './useEditHistory'
import { AdjustmentControls } from './EditorAdjustments'
import { dragCrop } from './cropInteraction'
vi.mock('@/components/ui',()=>({Button:({children,variant:_v,size:_s,...props}:React.ButtonHTMLAttributes<HTMLButtonElement>&{variant?:string;size?:string})=><button {...props}>{children}</button>}))
beforeEach(()=>{
  vi.stubGlobal('PointerEvent',MouseEvent)
  vi.stubGlobal('requestAnimationFrame',(fn:FrameRequestCallback)=>{fn(0);return 1})
  vi.stubGlobal('cancelAnimationFrame',vi.fn())
  vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockReturnValue({left:100,top:50,width:500,height:300} as DOMRect)
  HTMLElement.prototype.setPointerCapture=vi.fn();HTMLElement.prototype.hasPointerCapture=()=>true;HTMLElement.prototype.releasePointerCapture=vi.fn()
})
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals()})
it('keeps all eight resize handles inside bounds, respecting physical aspect ratios',()=>{
  const c={x:0.2,y:0.2,width:0.6,height:0.5}
  for(const handle of ['n','s','e','w','nw','ne','se','sw']) for(const dx of [-2,-0.2,0.1,2]) for(const dy of [-2,0.2,2]){
    const result=dragCrop(c,dx,dy,handle,1.5,800,600)
    expect(result.x).toBeGreaterThanOrEqual(0);expect(result.y).toBeGreaterThanOrEqual(0)
    expect(result.x+result.width).toBeLessThanOrEqual(1);expect(result.y+result.height).toBeLessThanOrEqual(1)
    expect(result.width*800/(result.height*600)).toBeCloseTo(1.5,10)
    expect(result.width*800).toBeGreaterThanOrEqual(1-1e-8)
  }
  expect(dragCrop(c,2,-2,'move',null,800,600)).toEqual({...c,x:0.4,y:0})
})
it('uses pointer positions relative to the image, coalesces moves, and cancels interrupted gestures',()=>{
  const update=vi.fn(),cancel=vi.fn(),c={x:0.2,y:0.2,width:0.5,height:0.5}
  render(<CropOverlay crop={c} onChange={update} onCancel={cancel} ratio={null} width={800} height={600}/>)
  const overlay=screen.getByRole('group',{name:'裁剪框'}),handle=screen.getByRole('button',{name:'调整裁剪 右下'})
  fireEvent.pointerDown(handle,{clientX:450,clientY:260,pointerId:1})
  fireEvent.pointerMove(overlay,{clientX:500,clientY:290,pointerId:1})
  expect(update.mock.calls.at(-1)?.[0].x).toBe(0.2)
  expect(update.mock.calls.at(-1)?.[0].y).toBe(0.2)
  expect(update.mock.calls.at(-1)?.[0].width).toBeCloseTo(0.6,12)
  expect(update.mock.calls.at(-1)?.[0].height).toBeCloseTo(0.6,12)
  fireEvent.pointerCancel(overlay,{pointerId:1})
  expect(update).toHaveBeenLastCalledWith(c)
  fireEvent.keyDown(overlay,{key:'Escape'});expect(cancel).toHaveBeenCalledOnce()
})
function Tools(){
  const [edit,setEdit]=useState<ImageEdits>({...DEFAULT_EDITS,exposure_ev:0.7})
  const [crop,setCrop]=useState<CropSession|null>(null)
  const history=useEditHistory(edit,setEdit,!crop)
  return <><output data-testid="state">{JSON.stringify(edit)}</output><GeometryPanel edit={edit} onChange={history.apply} crop={crop} onCrop={setCrop} width={800} height={600}/><AdjustmentControls edit={edit} controls={history}/></>
}
it('cancels without history, commits crop once, and geometry/reset are undoable',()=>{
  render(<Tools/>);const state=()=>JSON.parse(screen.getByTestId('state').textContent!)
  fireEvent.click(screen.getByText('裁剪照片'));fireEvent.change(screen.getByLabelText('裁剪比例'),{target:{value:'1.5'}})
  fireEvent.click(screen.getByText('取消裁剪'));expect(state().schema_version).toBe(1)
  expect(screen.getByText('撤销')).toBeDisabled()
  fireEvent.click(screen.getByText('裁剪照片'));fireEvent.change(screen.getByLabelText('裁剪比例'),{target:{value:'1.5'}})
  fireEvent.click(screen.getByText('应用裁剪'))
  expect(state().schema_version).toBe(2);expect(state().exposure_ev).toBe(0.7)
  const committed=state().geometry.crop as CropRect
  expect(committed.width*800/(committed.height*600)).toBeCloseTo(1.5,12)
  fireEvent.click(screen.getByText('右旋 90°'));expect(state().geometry.rotation_quadrants).toBe(1)
  fireEvent.click(screen.getByText('撤销'));expect(state().geometry.crop).toEqual(committed)
  fireEvent.click(screen.getByText('撤销'));expect(state().schema_version).toBe(1)
  fireEvent.click(screen.getByText('重做'));expect(state().geometry.crop).toEqual(committed)
  fireEvent.click(screen.getByText('重置几何'));expect(state().geometry).toEqual(identityGeometry())
  fireEvent.click(screen.getByText('撤销'));expect(state().geometry.crop).toEqual(committed)
  fireEvent.click(screen.getByText('裁剪照片'));expect(screen.getByLabelText('裁剪比例')).toHaveValue('free')
  expect(aspectCrop(committed,null,800,600)).toEqual(committed)
})
