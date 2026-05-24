import {
  CharacteristicGetHandler,
  CharacteristicSetHandler,
  CharacteristicValue
} from 'homebridge';

import { AccessoryThisType } from '..';
import { readState } from '../../readState';
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
  get: readState((info) => {
    const value = toHomeKitValues(info.color_temp || TP_LINK_VALUES.min);

    if (value < HOME_KIT_VALUES.min) {
      return HOME_KIT_VALUES.min;
    }

    if (value > HOME_KIT_VALUES.max) {
      return HOME_KIT_VALUES.max;
    }

    return value;
  }),
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
