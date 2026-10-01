'use client';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { PreferencesProvider } from './preferences';
import { type Action } from '@/lib/data/repository';
import type { Role } from '@/lib/data/domain';
import {
  api,
  readSession,
  readData,
  mutate,
  clearPrivateClientState,
  BackendError,
  type Session,
} from '@/lib/data/api';
const RoleContext = createContext<{
  role: Role;
  session: Session | null;
  loading: boolean;
  reload: () => Promise<unknown>;
  logout: () => Promise<void>;
}>({
  role: 'guest',
  session: null,
  loading: true,
  reload: async () => {},
  logout: async () => {},
});
function Identity({ children }: { children: ReactNode }) {
  const cache = useQueryClient();
  const session = useQuery({
    queryKey: ['session'],
    queryFn: readSession,
    retry: false,
    refetchOnWindowFocus: true,
    refetchInterval: 60000,
  });
  const logout = async () => {
    {
      try {
        await api('auth/logout', {});
      } catch (error) {
        if (!(error instanceof BackendError && error.status === 401))
          throw error;
      }
    }
    await Promise.all(
      ['session', 'mosque-data', 'mfa'].map((key) =>
        cache.cancelQueries({ queryKey: [key] }),
      ),
    );
    clearPrivateClientState();
    cache.removeQueries({ queryKey: ['mosque-data'] });
    cache.removeQueries({ queryKey: ['mfa'] });
    cache.setQueryData(['session'], null);
  };
  return (
    <RoleContext.Provider
      value={{
        role: session.data?.profile?.active
          ? session.data.profile.role
          : 'guest',
        session: session.data ?? null,
        loading: session.isPending,
        reload: () => session.refetch(),
        logout,
      }}
    >
      {children}
    </RoleContext.Provider>
  );
}
export function AppProviders({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30000, retry: 1, refetchOnWindowFocus: false },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <PreferencesProvider>
        <Identity>{children}</Identity>
      </PreferencesProvider>
    </QueryClientProvider>
  );
}
export const useIdentity = () => useContext(RoleContext);
export function useMosqueData() {
  const path = usePathname();
  const { session, loading, role } = useIdentity();
  return useQuery({
    queryKey: [
      'mosque-data',
      path,
      session?.userId ?? 'public',
      role,
      session?.aal,
      session?.profile?.permissions.join(','),
    ],
    queryFn: ({ signal }) => readData(session, path ?? 'all', signal),
    enabled:
      !loading &&
      ![
        '/admin/mosque',
        '/settings',
        '/login',
        '/forgot-password',
        '/invite',
      ].includes(path ?? ''),
    retry: false,
    refetchInterval: 60000,
  });
}
export function useMosqueAction() {
  const client = useQueryClient();
  const query = useMosqueData();
  return useMutation({
    mutationFn: async (a: Action) => {
      if (!query.data) throw Error('Records have not loaded.');
      return mutate(a, query.data);
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['mosque-data'] });
    },
  });
}
