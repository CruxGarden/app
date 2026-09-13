import MenuItem from '@mui/material/MenuItem';

import DeviceSelect from 'components/DeviceSelect';
import { useCameraShape } from 'contexts/cameraShape';

import CircleIcon from './icons/CircleIcon';
import SquareIcon from './icons/SquareIcon';

const ShapeSelect = () => {
  const { isCircle, setIsCircle } = useCameraShape();

  return (
    <DeviceSelect
      startAdornment={
        isCircle ? (
          <div onClick={() => setIsCircle(false)} style={{ cursor: 'pointer' }}>
            <CircleIcon />
          </div>
        ) : (
          <div onClick={() => setIsCircle(true)} style={{ cursor: 'pointer' }}>
            <SquareIcon />
          </div>
        )
      }
      value={isCircle ? 'circle' : 'square'}
      onChange={(event) => setIsCircle(event.target.value === 'circle')}
    >
      <MenuItem value="square">Square</MenuItem>
      <MenuItem value="circle">Circle</MenuItem>
    </DeviceSelect>
  );
};

export default ShapeSelect;
