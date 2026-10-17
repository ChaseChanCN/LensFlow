import { describe, expect, it } from 'vitest'
import fixtureText from './__fixtures__/image-edit-v1.json?raw'
import { DEFAULT_EDITS, editPixels, fitPhoto, validateEdits, type ImageEdits } from './imageEdit'

const fixture = JSON.parse(fixtureText) as { rgb: number[]; cases: { edit: ImageEdits; rgb: number[] }[] }
function rgba(rgb: number[]) {
  return new Uint8ClampedArray(rgb.flatMap((_, i) => i % 3 === 0 ? [...rgb.slice(i, i + 3), 255] : []))
}

describe('image edit v1', () => {
  it('matches actual backend NumPy outputs within one uint8 level per channel', () => {
    const source = rgba(fixture.rgb)
    for (const sample of fixture.cases) {
      const actual = editPixels(source, sample.edit), expected = rgba(sample.rgb)
      const differences = actual.map((value, i) => Math.abs(value - expected[i]))
      expect(Math.max(...differences)).toBeLessThanOrEqual(1)
      expect(differences.reduce((a, b) => a + b, 0) / differences.length).toBeLessThan(0.05)
    }
  })
  it('all sliders change pixels, reset restores the immutable original', () => {
    const original = rgba(fixture.rgb), snapshot = original.slice()
    for (const edit of [{ exposure_ev: 1 }, { contrast: 80 }, { saturation: -100 }]) {
      expect(editPixels(original, { ...DEFAULT_EDITS, ...edit })).not.toEqual(original)
      expect(original).toEqual(snapshot)
    }
    expect(editPixels(original, { ...DEFAULT_EDITS })).toEqual(snapshot)
  })
  it.each([NaN, Infinity, -Infinity, '1', true, null, 2.01, -2.01])('rejects invalid exposure %s', value => {
    expect(() => validateEdits({ ...DEFAULT_EDITS, exposure_ev: value } as ImageEdits)).toThrow()
  })
  it.each([101, -101, NaN, Infinity])('rejects other out of range controls %s', value => {
    expect(() => validateEdits({ ...DEFAULT_EDITS, contrast: value })).toThrow()
    expect(() => validateEdits({ ...DEFAULT_EDITS, saturation: value })).toThrow()
  })
  it('preserves aspect ratio across viewports and zoom levels', () => {
    for (const [w, h] of [[1000, 600], [320, 500], [1300, 300]]) {
      for (const zoom of [0.5, 1, 4]) {
        const result = fitPhoto(517, 606, w, h, zoom)
        expect(result.width / result.height).toBeCloseTo(517 / 606, 12)
        if (zoom === 1) { expect(result.width).toBeLessThanOrEqual(w); expect(result.height).toBeLessThanOrEqual(h) }
      }
    }
  })
})
