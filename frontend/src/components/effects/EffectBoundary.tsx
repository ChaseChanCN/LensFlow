import { Component, type ReactNode } from 'react'

// Decorative renderers must never take the underlying control down with them.
export class EffectBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}
