'use client';
import { createContext, useContext, useState, type ReactNode } from 'react';
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { PreferencesProvider } from './preferences';
import { demoRepository, type Action } from '@/lib/data/repository';
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
  setRole: (role: Role) => void;
  demo: boolean;
  session: Session | null;
  loading: boolean;
  reload: () => Promise<unknown>;
  logout: () => Promise<void>;
}>({
  role: 'guest',
  setRole: () => {},
  demo: false,
  session: null,
  loading: true,
  reload: async () => {},
  logout: async () => {},
});
function Identity({ children }: { children: ReactNode }) {
  const cache = useQueryClient();
  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: () => api<{ demo: boolean; turnstileSiteKey: string }>('settings'),
    retry: false,
  });
  const demo = settings.data?.demo === true;
  const [previewRole, setPreviewRole] = useState<Role>('guest');
  const session = useQuery({
    queryKey: ['session'],
    queryFn: readSession,
    enabled: !!settings.data && !demo,
    retry: false,
    refetchOnWindowFocus: true,
    refetchInterval: 60000,
  });
  const logout = async () => {
    if (!demo) {
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
    setPreviewRole('guest');
  };
  return (
    <RoleContext.Provider
      value={{
        role: demo
          ? previewRole
          : session.data?.profile?.active
            ? session.data.profile.role
            : 'guest',
        setRole: (r) => {
          if (demo) setPreviewRole(r);
        },
        demo,
        session: session.data ?? null,
        loading:
          settings.isPending ||
          (!demo && session.isPending && session.fetchStatus !== 'idle'),
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
export const useDemoRole = () => useContext(RoleContext);
export function useDemoData() {
  const { demo, session, loading, role } = useDemoRole();
  return useQuery({
    queryKey: [
      'mosque-data',
      demo ? 'demo' : (session?.userId ?? 'public'),
      role,
      session?.aal,
      session?.profile?.permissions.join(','),
    ],
    queryFn: () => (demo ? demoRepository.read() : readData(session)),
    enabled: !loading,
    refetchInterval: 60000,
  });
}
export function useDemoAction() {
  const client = useQueryClient();
  const { role, demo } = useDemoRole();
  const query = useDemoData();
  return useMutation({
    mutationFn: async (a: Action) => {
      if (demo) return demoRepository.mutate(role, a);
      if (!query.data) throw Error('Records have not loaded.');
      return mutate(a, query.data);
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['mosque-data'] });
    },
  });
}
