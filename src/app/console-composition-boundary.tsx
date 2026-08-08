import {
  Component,
  type ErrorInfo,
  type PropsWithChildren,
  type ReactNode,
} from "react";

interface ConsoleCompositionErrorBoundaryProps {
  fallback: ReactNode;
  onError: (error: unknown) => void;
}

interface ConsoleCompositionErrorBoundaryState {
  hasError: boolean;
}

export class ConsoleCompositionErrorBoundary extends Component<
  PropsWithChildren<ConsoleCompositionErrorBoundaryProps>,
  ConsoleCompositionErrorBoundaryState
> {
  constructor(props: PropsWithChildren<ConsoleCompositionErrorBoundaryProps>) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ConsoleCompositionErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, _info: ErrorInfo) {
    this.props.onError(error);
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}
