import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';

import chromeIcon from 'assets/chrome.svg';

import styles from './BrowserNotSupported.module.css';

const BrowserNotSupported = () => {
  return (
    <div className={styles.root}>
      <Typography variant="h6">This browser is not yet supported</Typography>
      <Typography variant="subtitle1">
        This app requires the following browser APIs which are currently only
        supported in Chrome:
      </Typography>
      <Typography variant="body2" color="text.secondary">
        • Document Picture-in-Picture API
        <br />
        • MediaStreamTrack Processor API
        <br />• MediaStreamTrack Generator API
      </Typography>
      <Link
        className={styles.chromeLink}
        href="https://www.google.com/chrome/"
        target="_blank"
        color="secondary"
        underline="none"
      >
        <img className={styles.chromeIcon} src={chromeIcon} />
        Google Chrome
      </Link>
    </div>
  );
};

export default BrowserNotSupported;
