import React, { useLayoutEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { ApiProvider, queryClient } from './api';
import { connectState, embedded, setModalOpen } from './state';
import { executeCommand } from './commands';
import { RouterProvider, useRouter, Link } from './navigation';
import Boards from '../apps/web/src/views/boards';
import Board from '../apps/web/src/views/board';
import Card, { CardRightPanel } from '../apps/web/src/views/card';
import Popup from '../apps/web/src/components/Popup';
import { WorkspaceProvider } from '../apps/web/src/providers/workspace';
import { LinguiProviderWrapper } from '../apps/web/src/providers/lingui';
import { KeyboardShortcutProvider } from '../apps/web/src/providers/keyboard-shortcuts';
import { FontSizeProvider } from '../apps/web/src/providers/font-size';
import { ThemeProvider } from '../apps/web/src/providers/theme';
import { ModalProvider, useModal } from '../apps/web/src/providers/modal';
import { PopupProvider } from '../apps/web/src/providers/popup';
import '../apps/web/src/styles/globals.css';
import './style.css';
function View() {
  const { isOpen } = useModal();
  useLayoutEffect(() => setModalOpen(isOpen), [isOpen]);
  const route = useRouter();
  // Native routes: /boards, /boards/:id, /cards/:id, /templates, /templates/:id, /templates/:id/cards/:id
  const template = route.pathname.startsWith('/templates');
  const card = /^\/(cards\/|templates\/[^/]+\/cards\/)/.test(route.pathname);
  const board = !card && /^\/(boards|templates)\/[^/]+/.test(route.pathname);
  return (
    <>
      <nav className="border-b p-3">
        <Link href="/boards">Kan · Boards</Link>
        <Link href="/templates" className="ml-4">
          Templates
        </Link>
        <span className="ml-6 text-light-900">
          {embedded ? 'Local workspace' : 'Local browser proof · changes are not yet saved'}
        </span>
      </nav>
      <main style={{ height: 'calc(100vh - 49px)' }}>
        {card ? (
          <div className="flex h-full">
            <div className="flex-1 overflow-auto">
              <Card isTemplate={template} />
            </div>
            <aside className="w-80 overflow-auto">
              <CardRightPanel isTemplate={template} />
            </aside>
          </div>
        ) : board ? (
          <Board isTemplate={template} />
        ) : (
          <Boards isTemplate={template} />
        )}
      </main>
      <Popup />
    </>
  );
}
createRoot(document.getElementById('root')!).render(
  <ApiProvider>
    <RouterProvider>
      <LinguiProviderWrapper>
        <KeyboardShortcutProvider>
          <FontSizeProvider>
            <ThemeProvider>
              <ModalProvider>
                <PopupProvider>
                  <WorkspaceProvider>
                    <View />
                  </WorkspaceProvider>
                </PopupProvider>
              </ModalProvider>
            </ThemeProvider>
          </FontSizeProvider>
        </KeyboardShortcutProvider>
      </LinguiProviderWrapper>
    </RouterProvider>
  </ApiProvider>,
);

connectState(
  () => queryClient.isMutating(),
  async (value) => {
    const result = executeCommand(value);
    await queryClient.invalidateQueries();
    return result;
  },
);
