interface ModalEntry {
  root: HTMLElement
  panel: HTMLElement
  depth: number
  options: () => { closeOnEsc: boolean; onClose: () => void; initialFocus?: HTMLElement | null }
  previousFocus?: HTMLElement | null
}
const stack: ModalEntry[] = []
const subscribers = new Set<() => void>()
const background = new Map<HTMLElement, string | null>()
let previousOverflow = ''
let observer: MutationObserver | undefined

export function getActiveModalPanel() {
  return stack.at(-1)?.panel ?? null
}
export function focusActiveModal() {
  const top = stack.at(-1)
  if (top) focusInside(top)
}
export function subscribeModalStack(callback: () => void) {
  subscribers.add(callback)
  return () => { subscribers.delete(callback) }
}
function notifyStack() {
  subscribers.forEach((callback) => callback())
}

function available(node: HTMLElement, panel: HTMLElement) {
    if (node.matches(':disabled, input[type="hidden"]')) return false
    for (let parent: HTMLElement | null = node; parent; parent = parent.parentElement) {
      if (parent.hidden || parent.hasAttribute('inert') || parent.getAttribute('aria-hidden') === 'true') return false
      const style = getComputedStyle(parent)
      if (style.display === 'none' || style.visibility === 'hidden') return false
      if (parent === panel) break
    }
    return true
}
function focusable(panel: HTMLElement) {
  return [...panel.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex], [contenteditable="true"]')].filter((node) => {
    if (node.tabIndex < 0 && node.getAttribute('contenteditable') !== 'true') return false
    return available(node, panel)
  }).filter((node, _, nodes) => {
    if (!(node instanceof HTMLInputElement) || node.type !== 'radio' || !node.name) return true
    const group = nodes.filter((other): other is HTMLInputElement => other instanceof HTMLInputElement && other.type === 'radio' && other.name === node.name && other.form === node.form)
    return node === (group.find((radio) => radio.checked) ?? group[0])
  }).sort((a, b) => (a.tabIndex > 0 ? a.tabIndex : Infinity) - (b.tabIndex > 0 ? b.tabIndex : Infinity))
}
function focusInside(entry: ModalEntry) {
  const preferred = entry.options().initialFocus
  const target = preferred && entry.panel.contains(preferred) && available(preferred, entry.panel) ? preferred : focusable(entry.panel)[0] ?? entry.panel
  target.focus({ preventScroll: true })
}
function syncBackground() {
  const top = stack.at(-1)
  stack.forEach((entry, index) => { entry.root.style.zIndex = `calc(var(--z-modal-backdrop) + ${index})` })
  if (!top) {
    for (const [element, value] of background) {
      if (value === null) element.removeAttribute('inert')
      else element.setAttribute('inert', value)
    }
    background.clear()
    return
  }
  for (const element of document.body.children) {
    if (!(element instanceof HTMLElement)) continue
    if (!background.has(element)) background.set(element, element.getAttribute('inert'))
    if (element === top.root) element.removeAttribute('inert')
    else element.setAttribute('inert', '')
  }
}
function onFocus(event: FocusEvent) {
  const top = stack.at(-1)
  if (top && event.target instanceof Node && !top.panel.contains(event.target)) focusInside(top)
}
function onKey(event: KeyboardEvent) {
  const top = stack.at(-1)
  if (!top || event.defaultPrevented || event.isComposing) return
  if (event.key === 'Escape' && top.options().closeOnEsc) {
    event.preventDefault()
    event.stopPropagation()
    top.options().onClose()
  } else if (event.key === 'Tab') {
    const nodes = focusable(top.panel)
    const index = nodes.indexOf(document.activeElement as HTMLElement)
    event.preventDefault()
    if (!nodes.length) {
      top.panel.focus()
    } else {
      const next = index < 0 ? (event.shiftKey ? nodes.length - 1 : 0) : (index + (event.shiftKey ? -1 : 1) + nodes.length) % nodes.length
      nodes[next].focus()
    }
  }
}

export function isTopModal(root: HTMLElement) {
  return stack.at(-1)?.root === root
}

export function mountModal(entry: ModalEntry) {
  entry.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
  if (!stack.length) {
    previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKey)
    document.addEventListener('focusin', onFocus)
    observer = new MutationObserver(syncBackground)
    observer.observe(document.body, { childList: true })
  }
  stack.push(entry)
  stack.sort((a, b) => a.depth - b.depth)
  syncBackground()
  notifyStack()
  if (stack.at(-1) === entry) focusInside(entry)
  return () => {
    const wasTop = stack.at(-1) === entry
    const index = stack.indexOf(entry)
    if (index < 0) return
    // A parent may unmount while a child is open; keep the original opener.
    for (const other of stack) {
      if (other !== entry && other.previousFocus && entry.root.contains(other.previousFocus)) other.previousFocus = entry.previousFocus
    }
    stack.splice(index, 1)
    if (!stack.length) {
      observer?.disconnect()
      observer = undefined
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('focusin', onFocus)
      document.body.style.overflow = previousOverflow
    }
    syncBackground()
    notifyStack()
    if (!wasTop) return
    const top = stack.at(-1)
    const previous = entry.previousFocus
    if (previous?.isConnected && !previous.closest('[inert]') && (!top || top.panel.contains(previous))) previous.focus({ preventScroll: true })
    else if (top) focusInside(top)
  }
}
