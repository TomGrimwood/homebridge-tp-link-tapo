import { CharacteristicGetHandler, CharacteristicValue } from 'homebridge';
import DeviceInfo from '../api/@types/DeviceInfo';
export declare function readState<T extends CharacteristicValue>(select: (info: DeviceInfo) => T): CharacteristicGetHandler;
//# sourceMappingURL=readState.d.ts.map