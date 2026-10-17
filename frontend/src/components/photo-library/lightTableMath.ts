export interface CompareView {zoom:number;cx:number;cy:number}
export const fitView=():CompareView=>({zoom:1,cx:.5,cy:.5})
export interface CompareGeometry {width:number;height:number;left:number;top:number;view:CompareView}
const clamp=(n:number,min:number,max:number)=>Math.min(max,Math.max(min,n))
export function compareGeometry(iw:number,ih:number,vw:number,vh:number,input:CompareView):CompareGeometry {
  const zoom=clamp(Number.isFinite(input.zoom)?input.zoom:1,1,8),fit=Math.min(vw/iw,vh/ih)
  const width=iw*fit*zoom,height=ih*fit*zoom
  const axis=(center:number,scaled:number,viewport:number)=>scaled<=viewport?.5:clamp(Number.isFinite(center)?center:.5,viewport/(2*scaled),1-viewport/(2*scaled))
  const view={zoom,cx:axis(input.cx,width,vw),cy:axis(input.cy,height,vh)}
  return {width,height,left:vw/2-view.cx*width,top:vh/2-view.cy*height,view}
}
export function panView(geometry:CompareGeometry,dx:number,dy:number):CompareView{return {...geometry.view,cx:geometry.view.cx-dx/geometry.width,cy:geometry.view.cy-dy/geometry.height}}
