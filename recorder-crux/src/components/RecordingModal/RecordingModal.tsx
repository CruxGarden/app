import { useEffect, useRef, useState } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import Button from '@mui/material/Button';
import styles from './RecordingModal.module.css';

type RecordingModalProps = {
  isOpen: boolean;
  onClose: () => void;
  recordingBlob: Blob | null;
};

export const RecordingModal = ({
  isOpen,
  onClose,
  recordingBlob,
}: RecordingModalProps) => {
  const [status, setStatus] = useState<'idle' | 'loading' | 'converting'>(
    'idle',
  );
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const ffmpegRef = useRef<FFmpeg>();

  useEffect(() => {
    const ffmpeg = new FFmpeg();
    ffmpegRef.current = ffmpeg;

    ffmpeg.on('log', ({ message }) => {
      console.log('FFmpeg log:', message);
      if (message.includes('configuration')) {
        setStatusMessage('Initializing encoder...');
      }
    });

    ffmpeg.on('progress', ({ progress }) => {
      console.log('FFmpeg progress:', progress);
      setStatus('converting');
      // Convert negative progress value to percentage (0-100)
      // Progress goes from large negative to small negative, so we need to normalize
      const normalizedProgress = Math.abs(progress);
      const startValue = 2500000; // Approximate starting value based on logs
      const percentage = Math.min(
        100,
        Math.max(
          0,
          Math.round(
            (1 - (startValue - normalizedProgress) / startValue) * 100,
          ),
        ),
      );
      setProgress(percentage);
      setStatusMessage(`Converting video... ${percentage}%`);
    });

    return () => {
      ffmpeg.off('log', () => {});
      ffmpeg.off('progress', () => {});
    };
  }, []);

  if (!isOpen || !recordingBlob) return null;

  const downloadWebm = () => {
    const url = URL.createObjectURL(recordingBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'recording.webm';
    link.click();
    URL.revokeObjectURL(url);
    onClose();
  };

  const convertToMp4 = async () => {
    if (!ffmpegRef.current) return;

    setStatus('loading');
    setStatusMessage('Loading FFmpeg libraries...');
    setProgress(0);

    const ffmpeg = ffmpegRef.current;

    try {
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';

      await ffmpeg.load({
        coreURL: await toBlobURL(
          `${baseURL}/ffmpeg-core.js`,
          'text/javascript',
        ),
        wasmURL: await toBlobURL(
          `${baseURL}/ffmpeg-core.wasm`,
          'application/wasm',
        ),
      });

      setStatusMessage('Processing input file...');
      await ffmpeg.writeFile('input.webm', await fetchFile(recordingBlob));

      setStatusMessage('Starting conversion...');
      await ffmpeg.exec(['-i', 'input.webm', '-c:v', 'libx264', 'output.mp4']);

      setStatusMessage('Reading converted file...');
      const data = await ffmpeg.readFile('output.mp4');

      // Download the converted file
      const url = URL.createObjectURL(
        new Blob([data instanceof Uint8Array ? data : new Uint8Array()], {
          type: 'video/mp4',
        }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = 'recording.mp4';
      link.click();
      URL.revokeObjectURL(url);

      setStatus('idle');
      setStatusMessage('');
      onClose();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error('Error converting video:', errorMessage);
      setStatusMessage(`Error: ${errorMessage}`);
      setStatus('idle');
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          backgroundColor: 'black',
          padding: '2rem',
          borderRadius: '8px',
          maxWidth: '400px',
          width: '100%',
        }}
      >
        <h2 style={{ marginTop: 0, marginBottom: '1.5rem' }}>
          Recording Complete
        </h2>
        {status !== 'idle' ? (
          <div>
            <p style={{ textAlign: 'center', margin: '1rem 0' }}>
              {statusMessage}
            </p>
            {status === 'converting' && (
              <div
                style={{
                  width: '100%',
                  height: '4px',
                  backgroundColor: '#eee',
                  borderRadius: '2px',
                  overflow: 'hidden',
                  marginTop: '1rem',
                }}
              >
                <div
                  style={{
                    width: `${progress}%`,
                    height: '100%',
                    backgroundColor: '#007bff',
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
            )}
          </div>
        ) : (
          <div
            style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}
          >
            <Button
              onClick={convertToMp4}
              className={styles.convertButton}

            >
              Convert (MP4)
            </Button>
            <Button
              onClick={downloadWebm}
              className={styles.downloadButton}
            >
              Download (WebM)
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
