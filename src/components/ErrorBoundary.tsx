import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { logSanitizedFirebaseError } from '../shared/lib/firebaseErrorHandling';

interface ErrorBoundaryProps {
  /** Nome da feature; quando presente, o heading vira "Anomalia em {label}". */
  label?: string;
  /**
   * Quando muda (e o boundary está em erro), reseta o estado automaticamente.
   * Usado com `currentPage` para que a navegação recupere o app após um crash.
   */
  resetKey?: unknown;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<
  React.PropsWithChildren<ErrorBoundaryProps>,
  ErrorBoundaryState
> {
  constructor(props: React.PropsWithChildren<ErrorBoundaryProps>) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    logSanitizedFirebaseError('app_error_boundary', error);
  }

  componentDidUpdate(prevProps: React.PropsWithChildren<ErrorBoundaryProps>) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      const heading = this.props.label ? `Anomalia em ${this.props.label}` : 'Anomalia Detetada';
      return (
        <div className="p-8 m-4 bg-quantum-card/80 border border-red-500/30 rounded-3xl flex flex-col items-center justify-center text-center backdrop-blur-md">
          <AlertTriangle className="w-16 h-16 text-red-500 mb-4 animate-pulse" />
          <h2 className="text-xl font-bold text-quantum-fg mb-2">{heading}</h2>
          <button
            onClick={() => this.setState({ hasError: false })}
            className="px-6 py-3 bg-red-600 hover:bg-red-700 text-quantum-fg rounded-xl text-sm font-bold transition-all shadow-lg shadow-red-500/20"
          >
            Reiniciar Módulo
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
