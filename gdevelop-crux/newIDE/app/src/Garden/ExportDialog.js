// @flow
import * as React from 'react';
import Dialog from '../UI/Dialog';
import RaisedButton from '../UI/RaisedButton';
import { browserHTML5ExportPipeline as pipeline } from '../ExportAndShare/BrowserExporters/BrowserHTML5Export';
export default function ExportDialog({ project, onClose }) {
  const [status, setStatus] = React.useState('Export a self-contained web game ZIP. This is a playable build; use Garden Export complete Crux to carry editable work and Growth.');
  const [busy, setBusy] = React.useState(false);
  return <Dialog open title="Export web game" onRequestClose={() => { if (!busy) onClose(); }} actions={[
    <RaisedButton key="export" label={busy ? 'Exporting…' : 'Download web game'} disabled={busy} onClick={async () => {
      setBusy(true);
      const context = { project, updateStepProgress: () => {} };
      try {
        setStatus('Building the game with GDevelop…');
        const prepared = await pipeline.prepareExporter(context);
        const output = await pipeline.launchExport(context, prepared, null);
        setStatus('Packaging game code and original assets…');
        const resources = await pipeline.launchResourcesDownload(context, output);
        const blob = await pipeline.launchCompression(context, resources);
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a'); link.href = url; link.download = 'game.zip'; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        setStatus('Export complete. Extract game.zip and serve its index.html with a static web server.');
      } catch (error) { setStatus('Export failed: ' + error.message); }
      finally { setBusy(false); }
    }} />,
  ]}><p role="status">{status}</p></Dialog>;
}
