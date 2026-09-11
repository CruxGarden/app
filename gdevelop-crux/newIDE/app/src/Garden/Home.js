// @flow
import * as React from 'react';
import RaisedButton from '../UI/RaisedButton';
const noop = () => {};
const Home = React.forwardRef((props, ref) => {
  const updateToolbar = React.useCallback(() => props.setToolbar(null), [props.setToolbar]);
  React.useEffect(() => { if (props.isActive) updateToolbar(); }, [props.isActive, updateToolbar]);
  React.useImperativeHandle(ref, () => ({
    getProject: () => props.project, updateToolbar, forceUpdateEditor: noop,
    onEventsBasedObjectChildrenEdited: noop, onSceneObjectEdited: noop,
    onSceneObjectsDeleted: noop, onSceneEventsModifiedOutsideEditor: noop,
    notifyChangesToInGameEditor: noop, switchInGameEditorIfNoHotReloadIsNeeded: noop,
    onInstancesModifiedOutsideEditor: noop, onObjectsModifiedOutsideEditor: noop,
    onWillDeleteObject: noop, onObjectGroupsModifiedOutsideEditor: noop, selectAllInsideEditor: noop,
  }));
  return <div style={{ padding: 32 }}>
    <h1>{props.project?.getName() || 'GDevelop'}</h1>
    <p>Create scenes, objects and events with GDevelop. Garden saves the game and original assets in this Crux.</p>
    <p>Use Garden Collaboration and Growth for AI help and version history. Export web game produces a playable build. Export complete Crux keeps the editable project and its history.</p>
    {props.project && Array.from({ length: props.project.getLayoutsCount() }, (_, i) => {
      const name = props.project.getLayoutAt(i).getName();
      return <RaisedButton key={name} label={'Open ' + name} onClick={() => props.onOpenLayout(name)} />;
    })}
    <p>Upstream accounts, hosted builds, asset store and paid services are not connected in this edition.</p>
    <RaisedButton label="Preferences" onClick={() => props.onOpenPreferences(true)} />
  </div>;
});
export default Home;
