import { sweepTempGardens } from './temp-gardens';

export default function globalTeardown() {
  sweepTempGardens();
}
