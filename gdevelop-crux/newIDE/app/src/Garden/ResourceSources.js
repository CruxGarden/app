// @flow
import * as React from 'react';
import { t } from '@lingui/macro';
import { allResourceKindsAndMetadata } from '../ResourcesList/ResourceSource';
import browserSources from '../ResourcesList/BrowserResourceSources';
import { addMedia } from './Project';
function LocalFiles({ createNewResource, onChooseResources, options, automaticallyOpenInput }) {
  const ref = React.useRef(null);
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  React.useEffect(() => { if (automaticallyOpenInput) ref.current?.click(); }, [automaticallyOpenInput]);
  return <div style={{ padding: 16 }}>
    <p>Import original files into this Crux. Garden keeps them with the game.</p>
    <input ref={ref} type="file" aria-label="Import game assets" multiple={!!options.multiSelection} disabled={loading} onChange={async event => {
      const files = Array.from(event.target.files || []);
      setLoading(true); setError('');
      try {
        const resources = [];
        for (const file of files) {
          const resource = createNewResource();
          resource.setFile(await addMedia(file)); resource.setName(file.name);
          resources.push(resource);
        }
        onChooseResources(resources);
      } catch (error) { setError(error.message); }
      finally { setLoading(false); }
    }} />
    {loading && <p>Importing…</p>}{error && <p role="alert">{error}</p>}
  </div>;
}
const sources = [
  ...allResourceKindsAndMetadata.filter(({ kind }) => !kind.toLowerCase().includes('spine')).map(({ kind, createNewResource }) => ({
    name: `garden-file-${kind}`, displayName: t`File(s) from your device`, displayTab: 'import',
    shouldCreateResource: true, shouldGuessAnimationsFromName: true, kind,
    renderComponent: props => <LocalFiles {...props} automaticallyOpenInput={!!props.automaticallyOpenIfPossible} createNewResource={createNewResource}
      onChooseResources={selectedResources => props.onChooseResources({ selectedResources, selectedSourceName: `garden-file-${kind}` })} />,
  })),
  ...browserSources.filter(source => source.name.startsWith('project-resources-')),
];

export default sources;
