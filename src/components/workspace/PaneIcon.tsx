import type { IconProps } from '@/components/ui/icons/Icon';
import { PANES, type PaneType } from './paneConfig';

/** A pane's glyph from the registry, drawn in the Mood's icon set. */
export default function PaneIcon({ type, ...rest }: { type: PaneType } & IconProps) {
  const Icon = PANES[type].icon;
  return <Icon {...rest} />;
}
