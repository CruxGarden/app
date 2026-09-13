import { createContext, useContext, useRef, useState } from 'react';

import { RecordingModal } from 'components/RecordingModal';
import { composeStreams } from 'services/composer';

import { useLayout } from './layout';
import { useStreams } from './streams';

type RecordingContextType = {
  isRecording: boolean;
  isPaused: boolean;
  startRecording: () => void;
  stopRecording: () => void;
  pauseRecording: () => void;
  resumeRecording: () => void;
  isModalOpen: boolean;
  closeModal: () => void;
};

const RecordingContext = createContext<RecordingContextType | undefined>(
  undefined,
);

type RecordingProviderProps = {
  children: React.ReactNode;
};

export const RecordingProvider = ({ children }: RecordingProviderProps) => {
  const { layout } = useLayout();
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null);
  const { cameraStream, microphoneStream, screenshareStream } = useStreams();

  const mediaRecorder = useRef<MediaRecorder>();

  const startRecording = () => {
    setIsRecording(true);

    const composedStream = composeStreams(
      layout === 'screenOnly' ? null : cameraStream,
      microphoneStream,
      layout === 'cameraOnly' ? null : screenshareStream,
    );
    mediaRecorder.current = new MediaRecorder(composedStream, {
      mimeType: 'video/webm; codecs=vp9',
      videoBitsPerSecond: 8e6,
    });

    const chunks: Blob[] = [];

    mediaRecorder.current.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };

    mediaRecorder.current.onstop = () => {
      composedStream
        .getVideoTracks()
        .forEach((composedTrack) => composedTrack.stop());

      const blob = new Blob(chunks);

      setRecordingBlob(blob);
      setIsModalOpen(true);
    };

    mediaRecorder.current.start();
  };

  const stopRecording = () => {
    mediaRecorder.current?.stop();
    setIsRecording(false);
    setIsPaused(false);
  };

  const pauseRecording = () => {
    mediaRecorder.current?.pause();
    setIsPaused(true);
  };

  const resumeRecording = () => {
    setIsPaused(false);
    mediaRecorder.current?.resume();
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setRecordingBlob(null);
  };

  return (
    <RecordingContext.Provider
      value={{
        isRecording,
        isPaused,
        startRecording,
        stopRecording,
        pauseRecording,
        resumeRecording,
        isModalOpen,
        closeModal,
      }}
    >
      {children}
      <RecordingModal
        isOpen={isModalOpen}
        onClose={closeModal}
        recordingBlob={recordingBlob}
      />
    </RecordingContext.Provider>
  );
};

export const useRecording = (): RecordingContextType => {
  const context = useContext(RecordingContext);

  if (context === undefined) {
    throw new Error('useRecording must be used within a RecordingProvider');
  }

  return context;
};
