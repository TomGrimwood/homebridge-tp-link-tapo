import {
  CharacteristicGetHandler,
  CharacteristicSetHandler,
  CharacteristicValue,
  Nullable
} from 'homebridge';

import { AccessoryThisType } from '..';
import { errorSummary, isNetworkError } from '../../../utils/errors';

import {
  toHomeKitValues,
  toTPLinkValues,
  TP_LINK_VALUES,
  HOME_KIT_VALUES
} from '../../../utils/translateColorTemp';

const characteristic: {
  get: CharacteristicGetHandler;
  set: CharacteristicSetHandler;
} & AccessoryThisType = {
  get: async function (): Promise<Nullable<CharacteristicValue>> {
    const deviceInfo = await this.tpLink.getInfo();
    const value = toHomeKitValues(deviceInfo.color_temp || TP_LINK_VALUES.min);

    if (value < HOME_KIT_VALUES.min) {
      return HOME_KIT_VALUES.min;
    }

    if (value > HOME_KIT_VALUES.max) {
      return HOME_KIT_VALUES.max;
    }

    return value;
  },
  set: async function (value: CharacteristicValue) {
    try {
      await this.tpLink.sendCommand(
        'colorTemp',
        toTPLinkValues(parseInt(value.toString()))
      );
    } catch (err: unknown) {
      const summary = errorSummary(err);
      if (isNetworkError(err)) {
        this.log.debug(
          '[%s] set color temperature skipped (offline): %s',
          this.mac,
          summary
        );
      } else {
        this.log.warn(
          '[%s] set color temperature failed: %s',
          this.mac,
          summary
        );
      }
    }
  }
};

export default characteristic;
