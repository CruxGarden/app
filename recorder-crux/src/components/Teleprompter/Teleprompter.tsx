'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, useAnimation } from 'framer-motion';
import {
  X,
  Play,
  Pause,
  Rewind,
  FastForward,
  Minus,
  Plus,
  RotateCcw,
} from 'lucide-react';
import styles from './Teleprompter.module.css';

const DEFAULT_SPEED = 0.2;

interface TeleprompterProps {
  onClose: () => void;
}

export function Teleprompter({ onClose }: TeleprompterProps) {
  const [text, setText] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(DEFAULT_SPEED);
  const [showInput, setShowInput] = useState(true);
  const scrollControls = useAnimation();
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [scrollProgress, setScrollProgress] = useState(0);

  const getScrollInfo = () => {
    if (!scrollContainerRef.current || !contentRef.current)
      return { totalScroll: 0, viewportHeight: 0 };
    const viewportHeight = scrollContainerRef.current.clientHeight;
    const totalScroll = contentRef.current.scrollHeight - viewportHeight;
    return { totalScroll, viewportHeight };
  };

  const togglePlay = () => {
    if (showInput) {
      setShowInput(false);
      setIsPlaying(true);
    } else {
      setIsPlaying(!isPlaying);
    }
  };

  const changeSpeed = (delta: number) => {
    setSpeed((prevSpeed) => {
      const newSpeed = Math.max(0.1, Math.min(prevSpeed + delta, 2));
      return Number.parseFloat(newSpeed.toFixed(1));
    });
  };

  const resetTeleprompter = () => {
    setSpeed(DEFAULT_SPEED);
    setScrollProgress(0);
    scrollControls.set({ y: 0 });
    setIsPlaying(false);
    setShowInput(true);
  };

  const seek = (direction: 'forward' | 'backward') => {
    const { totalScroll } = getScrollInfo();
    const seekAmount = totalScroll * 0.1;
    const newProgress =
      direction === 'forward'
        ? Math.min(scrollProgress + seekAmount, totalScroll)
        : Math.max(scrollProgress - seekAmount, 0);

    setScrollProgress(newProgress);
    scrollControls.start({ y: -newProgress, transition: { duration: 0.3 } });
  };

  useEffect(() => {
    let animationFrameId: number;

    const animate = () => {
      if (isPlaying && contentRef.current && scrollContainerRef.current) {
        const { totalScroll } = getScrollInfo();
        const newProgress = Math.min(scrollProgress + speed, totalScroll);
        setScrollProgress(newProgress);
        scrollControls.set({ y: -newProgress });

        if (newProgress >= totalScroll) {
          setIsPlaying(false);
        } else {
          animationFrameId = requestAnimationFrame(animate);
        }
      }
    };

    if (isPlaying) {
      animationFrameId = requestAnimationFrame(animate);
    }

    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, [isPlaying, speed, scrollProgress, scrollControls]);

  return (
    <motion.div
      drag
      dragMomentum={false}
      className={styles.container}
      draggable="false"
      style={{ touchAction: 'none', userSelect: 'none' }}
    >
      <div className={styles.content}>
        <button
          className={styles.closeButton}
          onClick={() => {
            setShowInput(true);
            setIsPlaying(false);
            onClose();
          }}
        >
          <X className="h-4 w-4" />
        </button>

        {showInput ? (
          <div className={styles.inputContainer}>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Start typing or paste text here..."
              className={styles.textarea}
              spellCheck="false"
            />
          </div>
        ) : (
          <div ref={scrollContainerRef} className={styles.scrollContainer}>
            <motion.div
              ref={contentRef}
              animate={scrollControls}
              className={styles.textContent}
            >
              {text}
            </motion.div>
          </div>
        )}

        <div className={styles.controls}>
          <div className={styles.speedControls}>
            <button
              className={styles.controlButton}
              onClick={() => changeSpeed(-0.1)}
            >
              <Minus className="h-4 w-4" />
            </button>
            <input
              type="text"
              value={speed.toFixed(1)}
              onChange={(e) => {
                const value = Number.parseFloat(e.target.value);
                if (!isNaN(value) && value >= 0.1 && value <= 2) {
                  setSpeed(value);
                }
              }}
              className={styles.speedInput}
            />
            <button
              className={styles.controlButton}
              onClick={() => changeSpeed(0.1)}
            >
              <Plus className="h-4 w-4" />
            </button>
            <button
              className={styles.controlButton}
              onClick={resetTeleprompter}
              title="Reset Teleprompter"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>

          <div className={styles.playbackControls}>
            <button
              className={styles.controlButton}
              onClick={() => seek('backward')}
            >
              <Rewind className="h-5 w-5" />
            </button>
            <button className={styles.controlButton} onClick={togglePlay}>
              {isPlaying ? (
                <Pause className="h-6 w-6" />
              ) : (
                <Play className="h-6 w-6" />
              )}
            </button>
            <button
              className={styles.controlButton}
              onClick={() => seek('forward')}
            >
              <FastForward className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
