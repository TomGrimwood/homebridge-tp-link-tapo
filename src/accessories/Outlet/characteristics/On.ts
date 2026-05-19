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
    const deviceInfo = await this.tpLink.getInfo();
    return deviceInfo.device_on || false;
  },
  set: async function (value: CharacteristicValue) {
    try {
      await this.tpLink.sendCommand('power', value as boolean);
    } catch (err: unknown) {
      const summary = errorSummary(err);
      if (isNetworkError(err)) {
        this.log.debug('[%s] set power skipped (offline): %s', this.mac, summary);
      } else {
        this.log.warn('[%s] set power failed: %s', this.mac, summary);
      }
    }
  }
};

export default characteristic;
