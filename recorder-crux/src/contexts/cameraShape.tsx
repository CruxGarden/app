import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from 'react';

type CameraShapeContextType = {
  isCircle: boolean;
  setIsCircle: (value: boolean) => void;
};

const CameraShapeContext = createContext<CameraShapeContextType | undefined>(
  undefined,
);

export const CameraShapeProvider = ({ children }: { children: ReactNode }) => {
  const [isCircle, setIsCircle] = useState(() => {
    const saved = localStorage.getItem('cameraShape');
    return saved === 'circle';
  });

  useEffect(() => {
    localStorage.setItem('cameraShape', isCircle ? 'circle' : 'square');
  }, [isCircle]);

  return (
    <CameraShapeContext.Provider value={{ isCircle, setIsCircle }}>
      {children}
    </CameraShapeContext.Provider>
  );
};

export const useCameraShape = () => {
  const context = useContext(CameraShapeContext);
  if (context === undefined) {
    throw new Error('useCameraShape must be used within a CameraShapeProvider');
  }
  return context;
};
