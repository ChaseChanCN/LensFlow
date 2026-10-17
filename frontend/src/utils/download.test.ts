import { afterEach, expect, it, vi } from 'vitest'
import { saveBlob } from './download'
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers()})
it('starts a named Blob download and releases the object URL after it starts',()=>{
  vi.useFakeTimers()
  const create=vi.fn(()=> 'blob:acceptance');const revoke=vi.fn();const OriginalURL=URL
  vi.stubGlobal('URL',Object.assign(class extends OriginalURL {},{createObjectURL:create,revokeObjectURL:revoke}))
  let clicked: { filename: string; href: string } | undefined
  vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(function(this:HTMLAnchorElement){clicked={filename:this.download,href:this.href}})
  const blob=new Blob(['test']);saveBlob(blob,'final.zip')
  expect(create).toHaveBeenCalledWith(blob);expect(clicked?.filename).toBe('final.zip');expect(clicked?.href).toBe('blob:acceptance')
  expect(document.querySelector('a[download]')).toBeNull();expect(revoke).not.toHaveBeenCalled()
  vi.advanceTimersByTime(1000);expect(revoke).toHaveBeenCalledWith('blob:acceptance')
})
