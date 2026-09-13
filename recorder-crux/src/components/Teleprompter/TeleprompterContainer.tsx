'use client';

import { Teleprompter } from './Teleprompter';
import styles from './TeleprompterContainer.module.css';

interface TeleprompterContainerProps {
  onClose: () => void;
}

export function TeleprompterContainer({ onClose }: TeleprompterContainerProps) {
  return (
    <div className={styles.container}>
      <Teleprompter onClose={onClose} />
    </div>
  );
}
