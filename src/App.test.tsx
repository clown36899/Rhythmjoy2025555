import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { describe, it, expect, vi } from 'vitest';

// AuthContext 모킹
vi.mock('./contexts/AuthContext', () => ({
    useAuth: () => ({
        user: null,
        session: null,
        isAdmin: false,
        loading: false,
        billboardUserId: null,
        billboardUserName: null,
        setBillboardUser: vi.fn(),
        signIn: vi.fn(),
        signInWithKakao: vi.fn(),
        signOut: vi.fn(),
    }),
    AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('App', () => {
    it('renders without crashing', () => {
        render(
            <MemoryRouter>
                <App />
            </MemoryRouter>
        );
        expect(true).toBeTruthy();
    });
});
