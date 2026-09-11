// @flow
import * as React from 'react';
import MainFrame from './MainFrame';
import Window from './Utils/Window';
import ExportDialog from './Garden/ExportDialog';
import Authentication from './Utils/GDevelopServices/Authentication';
import './UI/icomoon-font.css'; // Styles for Icomoon font.

// Import for browser only IDE
import browserResourceSources from './Garden/ResourceSources';
import { GardenStorageProvider, GardenResourceFetcher, GardenResourceMover } from './Garden/Project';
import BrowserSWPreviewLauncher from './ExportAndShare/BrowserExporters/BrowserSWPreviewLauncher';
import BrowserS3PreviewLauncher from './ExportAndShare/BrowserExporters/BrowserS3PreviewLauncher';

import makeExtensionsLoader from './JsExtensionsLoader/BrowserJsExtensionsLoader';
import ObjectsEditorService from './ObjectEditor/ObjectsEditorService';
import ObjectsRenderingService from './ObjectsRendering/ObjectsRenderingService';
import { makeBrowserSWEventsFunctionCodeWriter } from './EventsFunctionsExtensionsLoader/CodeWriters/BrowserSWEventsFunctionCodeWriter';
import { makeBrowserS3EventsFunctionCodeWriter } from './EventsFunctionsExtensionsLoader/CodeWriters/BrowserS3EventsFunctionCodeWriter';
import Providers from './MainFrame/Providers';
import ProjectStorageProviders from './ProjectsStorage/ProjectStorageProviders';
import BrowserEventsFunctionsExtensionOpener from './EventsFunctionsExtensionsLoader/Storage/BrowserEventsFunctionsExtensionOpener';
import BrowserEventsFunctionsExtensionWriter from './EventsFunctionsExtensionsLoader/Storage/BrowserEventsFunctionsExtensionWriter';
import { isServiceWorkerSupported, registerServiceWorker } from './ServiceWorkerSetup';
import { ensureBrowserSWPreviewSession } from './ExportAndShare/BrowserExporters/BrowserSWPreviewLauncher/BrowserSWPreviewIndexedDB';

export const create = async (authentication: Authentication): Promise<React.Node> => {
  Window.setUpContextMenu();
  // No upstream account is needed for Garden local projects.

  let app = null;
  const appArguments = Window.getArguments();

  // TODO: make a hook that allows this to change, so we can switch to S3
  // (and log this into Posthog).
  const canUseBrowserSW = isServiceWorkerSupported();
  await registerServiceWorker();
  await ensureBrowserSWPreviewSession();

  app = (
    <Providers
      authentication={authentication}
      disableCheckForUpdates={true}
      makeEventsFunctionCodeWriter={
        canUseBrowserSW
          ? makeBrowserSWEventsFunctionCodeWriter
          : makeBrowserS3EventsFunctionCodeWriter
      }
      // $FlowFixMe[incompatible-type]
      // $FlowFixMe[incompatible-exact]
      eventsFunctionsExtensionWriter={BrowserEventsFunctionsExtensionWriter}
      // $FlowFixMe[incompatible-type]
      // $FlowFixMe[incompatible-exact]
      eventsFunctionsExtensionOpener={BrowserEventsFunctionsExtensionOpener}
    >
      {({ i18n }) => (
        <ProjectStorageProviders
          appArguments={appArguments}
          storageProviders={[
            GardenStorageProvider,
          ]}
          defaultStorageProvider={GardenStorageProvider}
        >
          {({
            getStorageProviderOperations,
            getStorageProviderResourceOperations,
            storageProviders,
            initialFileMetadataToOpen,
            getStorageProvider,
          }) => (
            <MainFrame
              i18n={i18n}
              useCliCommandRunner={() => {}}
              renderPreviewLauncher={(props, ref) =>
                canUseBrowserSW ? (
                  // $FlowFixMe[incompatible-type]
                  <BrowserSWPreviewLauncher {...props} ref={ref} />
                ) : (
                  // $FlowFixMe[incompatible-type]
                  <BrowserS3PreviewLauncher {...props} ref={ref} />
                )
              }
              renderShareDialog={props => <ExportDialog project={props.project} onClose={props.onClose} />}
              quickPublishOnlineWebExporter={null}
              storageProviders={storageProviders}
              resourceMover={GardenResourceMover}
              resourceFetcher={GardenResourceFetcher}
              getStorageProviderOperations={getStorageProviderOperations}
              getStorageProviderResourceOperations={
                getStorageProviderResourceOperations
              }
              getStorageProvider={getStorageProvider}
              resourceSources={browserResourceSources}
              resourceExternalEditors={[]}
              extensionsLoader={makeExtensionsLoader({
                objectsEditorService: ObjectsEditorService,
                objectsRenderingService: ObjectsRenderingService,
                filterExamples: !Window.isDev(),
              })}
              initialFileMetadataToOpen={initialFileMetadataToOpen}
              initialExampleSlugToOpen={
                appArguments['create-from-example'] || null
              }
            />
          )}
        </ProjectStorageProviders>
      )}
    </Providers>
  );

  return app;
};
