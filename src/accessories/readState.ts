import { CharacteristicGetHandler, CharacteristicValue, Nullable } from 'homebridge';

import DeviceInfo from '../api/@types/DeviceInfo';
import TPLink from '../api/TPLink';

type StateReaderHost = {
  tpLink: TPLink;
};

export function readState<T extends CharacteristicValue>(
  select: (info: DeviceInfo) => T
): CharacteristicGetHandler {
  return function (this: StateReaderHost): Nullable<CharacteristicValue> {
    return select(this.tpLink.getStateSnapshot());
  };
}
