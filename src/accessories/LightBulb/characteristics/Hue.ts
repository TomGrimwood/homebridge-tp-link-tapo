import {
  CharacteristicGetHandler,
  CharacteristicSetHandler,
  CharacteristicValue
} from 'homebridge';

import { AccessoryThisType } from '..';
import { readState } from '../../readState';

const characteristic: {
  get: CharacteristicGetHandler;
  set: CharacteristicSetHandler;
} & AccessoryThisType = {
  get: readState((info) => info.hue || 0),
  set: async function (value: CharacteristicValue) {
    this.hue = parseInt(value.toString());
  }
};

export default characteristic;
