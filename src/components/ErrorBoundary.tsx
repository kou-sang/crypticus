import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/** Captura errores de render (incluidos chunks lazy que fallan tras un despliegue). */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ui] error de render', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="font-display text-3xl">Algo se descuadró.</p>
        <p className="text-sm text-muted">{this.state.error.message}</p>
        <button className="border border-ink px-4 py-2 text-sm font-semibold" onClick={() => window.location.reload()}>
          Recargar
        </button>
      </div>
    );
  }
}
