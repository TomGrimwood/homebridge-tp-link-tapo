import {
  CharacteristicGetHandler,
  CharacteristicSetHandler,
  CharacteristicValue,
  Nullable
} from 'homebridge';

import { AccessoryThisType } from '..';
import { errorSummary, isNetworkError } from '../../../utils/errors';

const characteristic: {
  get: CharacteristicGetHandler;
  set: CharacteristicSetHandler;
} & AccessoryThisType = {
  get: async function (): Promise<Nullable<CharacteristicValue>> {
    const deviceInfo = this.tpLink.getStateSnapshot();
    return deviceInfo.in_alarm
      ? this.Characteristic.SecuritySystemTargetState.AWAY_ARM
      : this.Characteristic.SecuritySystemTargetState.DISARM;
  },
  set: async function (value: CharacteristicValue) {
    try {
      await this.setAlarmEnabled(
        this.Characteristic.SecuritySystemTargetState.AWAY_ARM === value
      );
    } catch (err: unknown) {
      const summary = errorSummary(err);
      if (isNetworkError(err)) {
        this.log.debug(
          '[%s] set alarm state skipped (offline): %s',
          this.mac,
          summary
        );
      } else {
        this.log.warn('[%s] set alarm state failed: %s', this.mac, summary);
      }
    }
  }
};

export default characteristic;
