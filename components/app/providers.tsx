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
const RoleContext = createContext<{
  role: Role;
  setRole: (role: Role) => void;
}>({ role: 'guest', setRole: () => {} });
export function AppProviders({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30000, retry: 1, refetchOnWindowFocus: false },
        },
      }),
  );
  const [role, setRole] = useState<Role>('guest');
  return (
    <QueryClientProvider client={client}>
      <PreferencesProvider>
        <RoleContext.Provider value={{ role, setRole }}>
          {children}
        </RoleContext.Provider>
      </PreferencesProvider>
    </QueryClientProvider>
  );
}
export const useDemoRole = () => useContext(RoleContext);
export const useDemoData = () =>
  useQuery({ queryKey: ['mosque-demo'], queryFn: () => demoRepository.read() });
export function useDemoAction() {
  const client = useQueryClient();
  const { role } = useDemoRole();
  return useMutation({
    mutationFn: (a: Action) => demoRepository.mutate(role, a),
    onSuccess: ({ state }) => client.setQueryData(['mosque-demo'], state),
  });
}
