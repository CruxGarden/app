import Icon, { type IconProps } from './Icon';

/** Make something new. (The plus-circle is the logo, and opens the Navigator.) */
export default function PlusIcon(props: IconProps) {
  return <Icon name="plus" size={20} {...props} />;
}
