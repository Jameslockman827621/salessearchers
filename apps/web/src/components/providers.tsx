'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState, createContext, useContext, useEffect, ReactNode } from 'react';
import { api, ApiError } from '@/lib/api';

// Auth context
interface AuthState {
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    avatarUrl: string | null;
  } | null;
  tenant: {
    id: string;
    name: string;
    slug: string;
  } | null;
  permissions: string[];
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (data: {
    email: string;
    password: string;
    tenantName: string;
    firstName?: string;
    lastName?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// Create a query client
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000, // 1 minute
        retry: 1,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined = undefined;

function getQueryClient() {
  if (typeof window === 'undefined') {
    return makeQueryClient();
  }
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient();
  }
  return browserQueryClient;
}

// Auth provider
function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    tenant: null,
    permissions: [],
    isLoading: true,
    isAuthenticated: false,
  });

  const refreshAuth = async () => {
    try {
      const data = await api.getMe();
      setState({
        user: data.user,
        tenant: data.tenant,
        permissions: data.permissions,
        isLoading: false,
        isAuthenticated: true,
      });
    } catch (error) {
      setState({
        user: null,
        tenant: null,
        permissions: [],
        isLoading: false,
        isAuthenticated: false,
      });
    }
  };

  const login = async (email: string, password: string) => {
    const data = await api.login(email, password);
    setState({
      user: { ...data.user, avatarUrl: null },
      tenant: data.tenant,
      permissions: [], // Will be fetched on next refreshAuth
      isLoading: false,
      isAuthenticated: true,
    });
    await refreshAuth();
  };

  const register = async (data: {
    email: string;
    password: string;
    tenantName: string;
    firstName?: string;
    lastName?: string;
  }) => {
    const result = await api.register(data);
    setState({
      user: { ...result.user, avatarUrl: null },
      tenant: result.tenant,
      permissions: [],
      isLoading: false,
      isAuthenticated: true,
    });
    await refreshAuth();
  };

  const logout = async () => {
    try {
      await api.logout();
    } finally {
      setState({
        user: null,
        tenant: null,
        permissions: [],
        isLoading: false,
        isAuthenticated: false,
      });
    }
  };

  const hasPermission = (permission: string) => {
    return state.permissions.includes(permission);
  };

  useEffect(() => {
    refreshAuth();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        register,
        logout,
        refreshAuth,
        hasPermission,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// Main providers component
export function Providers({ children }: { children: ReactNode }) {
  const queryClient = getQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
      {process.env.NODE_ENV !== 'production' && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}
