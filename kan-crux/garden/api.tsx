import type { ReactNode } from 'react';
import type { AppRouter } from '../packages/api/src/root';
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import { createTRPCReact } from '@trpc/react-query';
import { TRPCClientError } from '@trpc/client';
import { observable } from '@trpc/server/observable';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { dispatch, recordNativeWrite } from './model';
export const api = createTRPCReact<AppRouter>();
export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false },
    mutations: { retry: false },
  },
});
const client = api.createClient({
  links: [
    () =>
      ({ op }) =>
        observable((observer) => {
          let active = true;
          Promise.resolve()
            .then(() => {
              try {
                const result = dispatch(op.path, op.input);
                if (op.type === 'mutation') recordNativeWrite(op.path, op.input);
                return result;
              } catch (error) {
                if (op.type === 'mutation') recordNativeWrite(op.path, op.input, error);
                throw error;
              }
            })
            .then(
              (data) => {
                if (active) {
                  observer.next({ result: { data } });
                  observer.complete();
                }
              },
              (error) => {
                console.error('Local Kan operation failed', op.path, error);
                if (active) observer.error(TRPCClientError.from(error));
              },
            );
          return () => {
            active = false;
          };
        }),
  ],
});
export function ApiProvider({ children }: { children: ReactNode }) {
  return (
    <api.Provider client={client} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </api.Provider>
  );
}
