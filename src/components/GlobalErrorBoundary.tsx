
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

class GlobalErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
        errorInfo: null,
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error, errorInfo: null };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
        this.setState({ errorInfo });
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    padding: '20px',
                    color: '#ff4444',
                    backgroundColor: '#1a1a1a',
                    minHeight: '100vh',
                    fontFamily: 'monospace',
                    overflow: 'auto',
                    zIndex: 9999,
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    width: '100%'
                }}>
                    <h2>Something went wrong.</h2>
                    <h3>{this.state.error?.toString()}</h3>
                    <pre style={{ whiteSpace: 'pre-wrap', fontSize: '12px', color: '#ccc' }}>
                        {this.state.errorInfo?.componentStack}
                    </pre>
                    <button
                        onClick={() => window.location.href = '/'}
                        style={{
                            marginTop: '20px',
                            padding: '10px 20px',
                            background: '#444',
                            color: 'white',
                            border: 'none',
                            borderRadius: '5px',
                            cursor: 'pointer'
                        }}
                    >
                        Reload Application
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

export default GlobalErrorBoundary;
