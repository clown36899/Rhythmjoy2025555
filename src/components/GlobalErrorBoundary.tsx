
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
                    <h2 style={{ color: '#fff' }}>
                        {this.state.error?.message?.includes('fetch') || this.state.error?.message?.includes('module') || this.state.error?.message?.includes('chunk')
                            ? "업데이트가 필요합니다"
                            : "문제가 발생했습니다"}
                    </h2>
                    <h3 style={{ fontSize: '14px', color: '#ff8888' }}>{this.state.error?.toString()}</h3>
                    <p style={{ color: '#aaa', fontSize: '13px', margin: '15px 0' }}>
                        최신 버전을 불러오는 중에 문제가 발생했을 수 있습니다.<br />
                        아래 버튼을 눌러 앱을 초기화하고 다시 시작해주세요.
                    </p>
                    <pre style={{
                        whiteSpace: 'pre-wrap',
                        fontSize: '11px',
                        color: '#666',
                        backgroundColor: '#000',
                        padding: '10px',
                        borderRadius: '4px',
                        maxHeight: '200px',
                        overflow: 'auto'
                    }}>
                        {this.state.errorInfo?.componentStack}
                    </pre>
                    <div style={{ display: 'flex', gap: '10px', marginTop: '25px' }}>
                        <button
                            onClick={async () => {
                                try {
                                    // 1. Clear all caches
                                    if ('caches' in window) {
                                        const keys = await caches.keys();
                                        await Promise.all(keys.map(key => caches.delete(key)));
                                    }
                                    // 2. Clear storage
                                    sessionStorage.clear();
                                    // 3. Reload
                                    window.location.reload();
                                } catch (e) {
                                    window.location.href = '/';
                                }
                            }}
                            style={{
                                padding: '12px 24px',
                                background: '#4f46e5',
                                color: 'white',
                                border: 'none',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                fontWeight: 'bold'
                            }}
                        >
                            앱 초기화 및 다시 읽기
                        </button>
                        <button
                            onClick={() => window.location.href = '/'}
                            style={{
                                padding: '12px 24px',
                                background: '#333',
                                color: 'white',
                                border: 'none',
                                borderRadius: '8px',
                                cursor: 'pointer'
                            }}
                        >
                            홈으로 이동
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default GlobalErrorBoundary;
