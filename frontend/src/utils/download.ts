export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // Keep the URL alive long enough for the browser to begin its download.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
