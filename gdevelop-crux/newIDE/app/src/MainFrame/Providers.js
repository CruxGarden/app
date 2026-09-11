// @flow
import * as React from 'react';
import DragAndDropContextProvider from '../UI/DragAndDrop/DragAndDropContextProvider';
import Authentication from '../Utils/GDevelopServices/Authentication';
import PreferencesProvider from './Preferences/PreferencesProvider';
import PreferencesContext from './Preferences/PreferencesContext';
import GDI18nProvider from '../Utils/i18n/GDI18nProvider';
import { I18n } from '@lingui/react';
import { type I18n as I18nType } from '@lingui/core';
import { EventsFunctionsExtensionsProvider } from '../EventsFunctionsExtensionsLoader/EventsFunctionsExtensionsProvider';
import {
  type EventsFunctionCodeWriter,
  type EventsFunctionCodeWriterCallbacks,
} from '../EventsFunctionsExtensionsLoader';
import {
  type EventsFunctionsExtensionWriter,
  type EventsFunctionsExtensionOpener,
} from '../EventsFunctionsExtensionsLoader/Storage';
import { UnsavedChangesContextProvider } from './UnsavedChangesContext';
import { CommandsContextProvider } from '../CommandPalette/CommandsContext';
import { BehaviorStoreStateProvider } from '../AssetStore/BehaviorStore/BehaviorStoreContext';
import { ObjectStoreStateProvider } from '../AssetStore/ObjectStoreContext';
import AlertProvider from '../UI/Alert/AlertProvider';
import { RouterContextProvider } from './RouterContext';
import ErrorBoundary from '../UI/ErrorBoundary';
import { FullThemeProvider } from '../UI/Theme/FullThemeProvider';
import { Trans } from '@lingui/macro';
import { Resource3DPreviewProvider } from '../ResourcesList/ResourcePreview/Resource3DPreviewContext';

type Props = {|
  authentication: Authentication,
  disableCheckForUpdates: boolean,
  makeEventsFunctionCodeWriter: (EventsFunctionCodeWriterCallbacks) => ?EventsFunctionCodeWriter,
  eventsFunctionsExtensionWriter: ?EventsFunctionsExtensionWriter,
  eventsFunctionsExtensionOpener: ?EventsFunctionsExtensionOpener,
  children: ({| i18n: I18nType |}) => React.Node,
|};

/**
 * Wrap the children with Drag and Drop, Material UI theme and i18n React providers,
 * so that these modules can be used in the children.
 */
const Providers = ({
  disableCheckForUpdates,
  children,
  makeEventsFunctionCodeWriter,
  eventsFunctionsExtensionWriter,
  eventsFunctionsExtensionOpener,
}: Props): React.Node => {
  return (
    <DragAndDropContextProvider>
      <UnsavedChangesContextProvider>
        <RouterContextProvider>
          <PreferencesProvider disableCheckForUpdates={disableCheckForUpdates}>
            <PreferencesContext.Consumer>
              {({ values }) => (
                <GDI18nProvider language={values.language.replace('_', '-')}>
                  <FullThemeProvider>
                    <ErrorBoundary
                      componentTitle={<Trans>GDevelop app</Trans>}
                      scope="app"
                    >
                      <AlertProvider>
                        <I18n update>
                          {({ i18n }) => (
                            <EventsFunctionsExtensionsProvider
                              i18n={i18n}
                              makeEventsFunctionCodeWriter={
                                makeEventsFunctionCodeWriter
                              }
                              eventsFunctionsExtensionWriter={
                                eventsFunctionsExtensionWriter
                              }
                              eventsFunctionsExtensionOpener={
                                eventsFunctionsExtensionOpener
                              }
                            >
                              <CommandsContextProvider>
                                <BehaviorStoreStateProvider i18n={i18n}>
                                  <ObjectStoreStateProvider i18n={i18n}>
                                    <Resource3DPreviewProvider>
                                      {children({
                                        i18n,
                                      })}
                                    </Resource3DPreviewProvider>
                                  </ObjectStoreStateProvider>
                                </BehaviorStoreStateProvider>
                              </CommandsContextProvider>
                            </EventsFunctionsExtensionsProvider>
                          )}
                        </I18n>
                      </AlertProvider>
                    </ErrorBoundary>
                  </FullThemeProvider>
                </GDI18nProvider>
              )}
            </PreferencesContext.Consumer>
          </PreferencesProvider>
        </RouterContextProvider>
      </UnsavedChangesContextProvider>
    </DragAndDropContextProvider>
  );
};

export default Providers;
