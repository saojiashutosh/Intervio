import { Component, type ErrorInfo, type ReactNode } from 'react'

/** Without this, one render error unmounts the whole app and leaves a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) { return { error } }

  componentDidCatch(error: Error, info: ErrorInfo) { console.error('Intervio render error:', error, info.componentStack) }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="card" role="alert">
        <h2>Something went wrong on this page</h2>
        <p className="muted">The rest of the app is fine. Reloading usually fixes it.</p>
        <pre className="codebox">{this.state.error.message}</pre>
        <div className="row">
          <button className="btn primary" onClick={() => window.location.reload()}>Reload</button>
          <button className="btn ghost" onClick={() => this.setState({ error: null })}>Try again</button>
          <a className="btn ghost" href="/">Go home</a>
        </div>
      </div>
    )
  }
}
