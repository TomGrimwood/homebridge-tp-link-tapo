import { PlatformAccessory, Logger } from 'homebridge';

import { ChildInfo } from '../../api/@types/ChildListInfo';
import HubAccessory, { HubContext } from '../Hub';
import Accessory from '../../@types/Accessory';
import Context from '../../@types/Context';
import Platform from '../../platform';
import delay from '../../utils/delay';

import StatusLowBattery from './characteristics/StatusLowBattery';
import StatusActive from './characteristics/StatusActive';

export type AccessoryThisType = ThisType<{
  readonly hub: HubAccessory;
  readonly getInfo: () => Promise<ChildInfo>;
}>;

type State = {
  detected: boolean;
  active: boolean;
};

export default class MotionSensorAccessory extends Accessory {
  private interval?: NodeJS.Timeout;
  private lastEventUpdate = 0;

  public get UUID() {
    return this.accessory.UUID.toString();
  }

  private getInfo() {
    return this.hub.getChildInfo(this.deviceInfo.device_id);
  }

  constructor(
    private readonly hub: HubAccessory,
    platform: Platform,
    accessory: PlatformAccessory<HubContext>,
    log: Logger,
    deviceInfo: ChildInfo
  ) {
    super(
      platform,
      accessory as unknown as PlatformAccessory<Context>,
      log,
      deviceInfo
    );

    this.accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(
        this.platform.Characteristic.Manufacturer,
        'TP-Link Technologies'
      )
      .setCharacteristic(this.platform.Characteristic.Model, this.model)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, this.mac);

    const service =
      this.accessory.getService(this.platform.Service.MotionSensor) ||
      this.accessory.addService(this.platform.Service.MotionSensor);

    const motionDetected = service.getCharacteristic(
      this.platform.Characteristic.MotionDetected
    );
    const isActive = service.getCharacteristic(
      this.platform.Characteristic.StatusActive)
      .onGet(StatusActive.get.bind(this));

    service
      .getCharacteristic(this.platform.Characteristic.StatusLowBattery)
      .onGet(StatusLowBattery.get.bind(this));

    const checkStatus = async (initStatus?: State) => {
      if (initStatus) {
        motionDetected.updateValue(initStatus.detected);
        isActive.updateValue(initStatus.active);
      }

      try {
        const response = await this.getInfo();
        if (!response) {
          this.log.debug('[%s] motion poll: no response, backing off', this.mac);
          await delay(500);
          return;
        }

        motionDetected.updateValue(response.detected);
      } catch (error: unknown) {
        this.log.debug(
          '[%s] motion poll failed: %s',
          this.mac,
          error instanceof Error ? error.message : String(error)
        );
        await delay(500);
      }
    };

    this.setup(checkStatus.bind(this));
  }

  cleanup() {
    clearInterval(this.interval!);
  }

  private async setup(callback: (x?: State) => Promise<void>) {
    const init = await this.getInfo();

    await callback({
      detected: init.detected,
      active: init.status === 'online'
    });
    // NB: original code passed `5` (milliseconds) here, which polled
    // the hub 200x/second and was almost certainly meant to be 5000.
    // 500ms gives motion-sensor-grade responsiveness without
    // hammering the hub.
    this.interval = setInterval(() => {
      callback();
    }, 500);
  }
}
