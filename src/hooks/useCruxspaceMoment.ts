import { useContext, useEffect, useState } from 'react';
import { useCruxStore } from '@/stores/cruxStore';
import { WorkspaceContext } from '@/stores/workspaceSelection';
import { applyCruxspaceWalk, startCruxspaceWalk } from '@/stores/cruxspaceWalk';
import {
  CRUXSPACE_MOMENT_CHANGED,
  getCruxspaceMoment,
  snapshotIndexAt,
  type CruxspaceMoment,
} from '@/services/cruxspace-moment';
import { listCruxspaces } from '@/services/cruxspaces';
import { copyIdentity } from '@/services/working-copies';

/**
 * The walkthrough as seen from one workspace: whether this Crux takes part in
 * the moment being walked and whether it existed by then. Applying the moment
 * (and releasing it) is done for every open workspace by the walk store; this
 * hook only makes sure a workspace that opens mid-walk catches up.
 */
export function useCruxspaceMoment(): {
  moment: CruxspaceMoment | null;
  member: boolean;
  existed: boolean;
} {
  const workspace = useContext(WorkspaceContext);
  const crux = useCruxStore((s) => s.crux);
  const growths = useCruxStore((s) => s.growths);
  const [moment, setMoment] = useState(getCruxspaceMoment);
  const [member, setMember] = useState(false);
  const cruxId = crux?.id;
  const isTask = !!(crux && copyIdentity(crux));
  useEffect(() => {
    startCruxspaceWalk();
    const update = () => setMoment(getCruxspaceMoment());
    window.addEventListener(CRUXSPACE_MOMENT_CHANGED, update);
    return () => window.removeEventListener(CRUXSPACE_MOMENT_CHANGED, update);
  }, []);
  useEffect(() => {
    let live = true;
    if (!moment || !cruxId || isTask) {
      setMember(false);
      return;
    }
    void listCruxspaces()
      .then((spaces) => {
        if (live)
          setMember(spaces.some((s) => s.id === moment.spaceId && s.cruxIds.includes(cruxId)));
      })
      .catch(() => {
        if (live) setMember(false);
      });
    return () => {
      live = false;
    };
  }, [moment, cruxId, isTask]);
  useEffect(() => {
    // A workspace opened (or finished loading its Growth) during a walk catches up.
    if (workspace && cruxId && moment) void applyCruxspaceWalk(workspace);
  }, [workspace, cruxId, moment, growths.length]);
  const existed = !moment || !member || snapshotIndexAt(growths, moment.at) !== null;
  return { moment, member, existed };
}
