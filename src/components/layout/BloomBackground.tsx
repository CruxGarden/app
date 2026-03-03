import { useMemo } from 'react';

const BLOB_COUNT = 6;

export default function BloomBackground() {
  // Random negative delays so each blob starts at a different point in its cycle
  const delays = useMemo(
    () => Array.from({ length: BLOB_COUNT }, () => -(Math.random() * 300)),
    [],
  );

  return (
    <div className="bloom-background" aria-hidden="true">
      <svg xmlns="http://www.w3.org/2000/svg" style={{ position: 'absolute', width: 0, height: 0 }}>
        <defs>
          <filter id="goo">
            <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -8"
              result="goo"
            />
            <feBlend in="SourceGraphic" in2="goo" />
          </filter>
        </defs>
      </svg>
      <div className="bloom-blobs">
        {Array.from({ length: BLOB_COUNT }, (_, i) => (
          <div
            key={i}
            className={`bloom-blob bloom-blob-${i + 1}`}
            style={{ animationDelay: `${delays[i]}s` }}
          />
        ))}
      </div>
    </div>
  );
}
