import MenuItem from '@mui/material/MenuItem';
import DeviceSelect from 'components/DeviceSelect';
import { TeleprompterIcon } from 'components/ShapeSelect/icons/TeleprompterIcon';
import { useState } from 'react';
import Teleprompter from 'components/Teleprompter';

const TeleprompterSelect = () => {
  const [showTeleprompter, setShowTeleprompter] = useState(false);

  return (
    <>
      <DeviceSelect
        startAdornment={
          <div onClick={() => setShowTeleprompter(!showTeleprompter)} style={{ cursor: 'pointer' }}>
            <TeleprompterIcon />
          </div>
        }
        value={showTeleprompter ? 'show' : 'hide'}
        onChange={(event) => setShowTeleprompter(event.target.value === 'show')}
      >
        <MenuItem value="hide">Hide Teleprompter</MenuItem>
        <MenuItem value="show">Show Teleprompter</MenuItem>
      </DeviceSelect>
      {showTeleprompter && <Teleprompter onClose={() => setShowTeleprompter(false)} />}
    </>
  );
};

export default TeleprompterSelect;
