import React, { lazy, Suspense } from 'react';
export default function Head({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
export function Image({
  src,
  alt,
  fill,
  priority,
  unoptimized,
  ...props
}: React.ImgHTMLAttributes<HTMLImageElement> & {
  fill?: boolean;
  priority?: boolean;
  unoptimized?: boolean;
}) {
  return <img src={src} alt={alt ?? ''} {...props} />;
}
export function dynamic(loader: () => Promise<{ default: React.ComponentType }>) {
  const Component = lazy(loader);
  return function LazyComponent(props: Record<string, unknown>) {
    return (
      <Suspense fallback={null}>
        <Component {...props} />
      </Suspense>
    );
  };
}
