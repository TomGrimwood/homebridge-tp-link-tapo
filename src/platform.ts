import {
  API,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  PlatformConfig,
  Service,
  Characteristic
} from 'homebridge';

import Accessory, { AccessoryType, ChildType } from './@types/Accessory';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import DeviceInfo from './api/@types/DeviceInfo';
import Context from './@types/Context';
import TPLink from './api/TPLink';
import delay from './utils/delay';

import HubAccessory, { HubContext } from './accessories/Hub';
import LightBulbAccessory from './accessories/LightBulb';
import OutletAccessory from './accessories/Outlet';
import { ChildInfo } from './api/@types/ChildListInfo';
import ButtonAccessory from './accessories/Button';
import ContactAccessory from './accessories/Contact';
import MotionSensorAccessory from './accessories/MotionSensor';

export default class Platform implements DynamicPlatformPlugin {
  // Initial connect attempts at startup. Kept low so Homebridge boots
  // quickly even when some devices are offline; background reconnects
  // continue indefinitely (see RECONNECT_INTERVAL_MS).
  private readonly TIMEOUT_TRIES = 3;

  // How often to retry offline devices in the background. Reconnect
  // passes are single-attempt-per-device with no internal delays, so
  // 30s is cheap (a few short TCP connect attempts per tick) and means
  // a device coming back online appears in HomeKit within ~30s.
  private readonly RECONNECT_INTERVAL_MS = 30 * 1000;

  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic =
    this.api.hap.Characteristic;

  public readonly accessories: PlatformAccessory<Context | HubContext>[] = [];
  public readonly loadedChildUUIDs: Record<string, true> = {};
  public readonly registeredDevices: Accessory[] = [];
  public readonly hubs: HubAccessory[] = [];
  private readonly deviceRetry: {
    [key: string]: number;
  } = {};
  // Tracks IPs that finished their startup retries without succeeding.
  // The background reconnect loop will keep trying these forever.
  private readonly offlineAddresses = new Set<string>();
  private reconnectTimer?: NodeJS.Timeout;
  // Guard so a slow reconnect pass cannot overlap with the next tick.
  private reconnectInProgress = false;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API
  ) {
    this.log.debug('Finished initializing platform:', this.config.name);

    this.api.on('didFinishLaunching', () => {
      log.debug('Executed didFinishLaunching callback');
      this.discoverDevices().then(() => this.startReconnectLoop());
    });

    this.api.on('shutdown', () => {
      if (this.reconnectTimer) {
        clearInterval(this.reconnectTimer);
        this.reconnectTimer = undefined;
      }
    });
  }

  private startReconnectLoop() {
    if (this.reconnectTimer) {
      return;
    }
    this.reconnectTimer = setInterval(() => {
      void this.reconnectOfflineDevices();
    }, this.RECONNECT_INTERVAL_MS);
    // Don't keep the process alive solely for this timer.
    this.reconnectTimer.unref?.();
  }

  private async reconnectOfflineDevices() {
    if (this.reconnectInProgress) {
      // Previous pass still running (unusual — a single pass should
      // finish in a few seconds). Skip this tick to avoid overlap.
      return;
    }
    const { email, password } = this.config ?? {};
    if (!email || !password || this.offlineAddresses.size === 0) {
      return;
    }

    this.reconnectInProgress = true;
    try {
      const addresses = [...this.offlineAddresses];
      this.log.debug(
        'Background reconnect: trying %d offline device(s)',
        addresses.length
      );

      // Single attempt per device per tick, in parallel. Each attempt
      // is just a TCP connect + key exchange — failures return in
      // ~1-3s (EHOSTUNREACH after ARP), so the whole pass is fast
      // even with many offline devices.
      await Promise.all(
        addresses.map(async (ip) => {
          try {
            await this.loadDevice(ip, email, password, true);
          } catch (err: any) {
            this.log.debug(
              'Background reconnect attempt failed for %s: %s',
              ip,
              err?.message ?? String(err)
            );
          }
        })
      );

      // Re-scan hubs in case a hub came back online and brought
      // children with it.
      if (this.hubs.length > 0) {
        try {
          await Promise.all(
            this.hubs.map(async (hub) => {
              const devices = await hub.getChildDevices();
              await Promise.all(
                devices.map((device) => {
                  if (Object.keys(device || {}).length === 0) {
                    return Promise.resolve();
                  }
                  const childUuid = this.api.hap.uuid.generate(
                    device.device_id
                  );
                  if (this.loadedChildUUIDs[childUuid]) {
                    return Promise.resolve();
                  }
                  this.loadedChildUUIDs[childUuid] = true;
                  return this.loadChildDevice(device.device_id, device, hub);
                })
              );
            })
          );
        } catch (err: any) {
          this.log.debug(
            'Background reconnect hub child sweep failed: %s',
            err?.message ?? String(err)
          );
        }
      }
    } finally {
      this.reconnectInProgress = false;
    }
  }

  configureAccessory(accessory: PlatformAccessory<Context>) {
    this.log.info('Loading accessory from cache:', accessory.displayName);
    this.accessories.push(accessory);
  }

  private async discoverDevices() {
    try {
      const { email, password, addresses } = this.config ?? {};
      if (
        !email ||
        !password ||
        !addresses ||
        !Array.isArray(addresses) ||
        addresses.length <= 0
      ) {
        if (this.accessories.length > 0) {
          this.api.unregisterPlatformAccessories(
            PLUGIN_NAME,
            PLATFORM_NAME,
            this.accessories
          );
        }

        return;
      }

      await Promise.all(
        addresses.map((address) => this.loadDevice(address, email, password))
      );

      await Promise.all(
        this.hubs.map(async (hub) => {
          const devices = await hub.getChildDevices();
          await Promise.all(
            devices.map((device) => {
              if (Object.keys(device || {}).length === 0) {
                return Promise.resolve();
              }

              this.loadedChildUUIDs[
                this.api.hap.uuid.generate(device.device_id)
              ] = true;
              return this.loadChildDevice(device.device_id, device, hub);
            })
          );
        })
      );

      this.checkOldDevices();
    } catch (err: any) {
      this.log.error('Failed to discover devices:', err.message);
    }
  }

  private async loadDevice(
    ip: string,
    email: string,
    password: string,
    singleAttempt = false
  ) {
    const uuid = this.api.hap.uuid.generate(ip);

    if (!singleAttempt) {
      // Startup path: retry up to TIMEOUT_TRIES with 10s delays between
      // attempts before deferring to the background reconnect loop.
      if (this.deviceRetry[uuid] === undefined) {
        this.deviceRetry[uuid] = this.TIMEOUT_TRIES;
      } else if (this.deviceRetry[uuid] <= 0) {
        this.offlineAddresses.add(ip);
        this.log.info(
          '%s is offline; will keep trying in the background every %ds.',
          ip,
          Math.round(this.RECONNECT_INTERVAL_MS / 1000)
        );
        return;
      } else {
        this.log.debug(
          'Retrying %s in 10s (%d/%d)',
          ip,
          this.deviceRetry[uuid],
          this.TIMEOUT_TRIES
        );
        await delay(10 * 1000);
      }
    }

    try {
      const tpLink = await new TPLink(ip, email, password, this.log).setup();
      const deviceInfo = await tpLink.getInfo();
      if (Object.keys(deviceInfo || {}).length === 0) {
        this.log.debug('No info from %s yet.', ip);
        if (singleAttempt) {
          // Stay in offlineAddresses; next reconnect tick will try
          // again.
          this.offlineAddresses.add(ip);
          return;
        }
        this.deviceRetry[uuid] -= 1;
        return await this.loadDevice(ip, email, password);
      }
      // Success — remove from offline list if it was there.
      this.offlineAddresses.delete(ip);

      const deviceName = Buffer.from(
        deviceInfo?.nickname || 'Tm8gTmFtZQ==',
        'base64'
      ).toString('utf-8');

      const existingAccessory = this.accessories.find(
        (accessory) => accessory.UUID === uuid
      );

      if (existingAccessory) {
        this.log.info(
          'Restoring existing accessory from cache:',
          existingAccessory.displayName
        );
        existingAccessory.context = {
          name: deviceName,
          tpLink,
          child: false
        };

        const registeredAccessory = this.registerAccessory(
          existingAccessory,
          deviceInfo
        );
        if (!registeredAccessory) {
          this.log.error(
            'Failed to register accessory "%s" of type "%s" (%s)',
            deviceName,
            Accessory.GetType(deviceInfo),
            deviceInfo?.type
          );
          return;
        }

        this.registeredDevices.push(registeredAccessory);
        return;
      }

      this.log.info('Adding new accessory:', deviceName);
      const accessory = new this.api.platformAccessory<Context>(
        deviceName,
        uuid
      );
      accessory.context = {
        name: deviceName,
        tpLink,
        child: false
      };

      const registeredAccessory = this.registerAccessory(accessory, deviceInfo);
      if (!registeredAccessory) {
        this.log.error(
          'Failed to register accessory "%s" of type "%s" (%s)',
          deviceName,
          Accessory.GetType(deviceInfo),
          deviceInfo?.type
        );
        return;
      }

      this.registeredDevices.push(registeredAccessory);

      return this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
        accessory
      ]);
    } catch (err: any) {
      this.log.debug(
        'Failed to get info about %s: %s',
        ip,
        err?.message ?? String(err)
      );
      if (singleAttempt) {
        // Stay in offlineAddresses; the next reconnect tick will try
        // again.
        this.offlineAddresses.add(ip);
        return;
      }
      this.deviceRetry[uuid] -= 1;
      return await this.loadDevice(ip, email, password);
    }
  }

  private async loadChildDevice(
    id: string,
    deviceInfo: ChildInfo,
    parent: HubAccessory
  ) {
    const uuid = this.api.hap.uuid.generate(id);
    if (this.deviceRetry[uuid] === undefined) {
      this.deviceRetry[uuid] = this.TIMEOUT_TRIES;
    } else if (this.deviceRetry[uuid] <= 0) {
      this.log.debug(
        'Child device %s not ready; background reconnect will retry.',
        id
      );
      return;
    } else {
      this.log.debug(
        'Retrying child %s in 10s (%d/%d)',
        id,
        this.deviceRetry[uuid],
        this.TIMEOUT_TRIES
      );
      await delay(10 * 1000);
    }

    try {
      const deviceName = Buffer.from(
        deviceInfo.nickname || 'Tm8gTmFtZQ==',
        'base64'
      ).toString('utf-8');

      const existingAccessory = this.accessories.find(
        (accessory) => accessory.UUID === uuid
      );

      if (existingAccessory) {
        this.log.info(
          'Restoring existing child accessory from cache:',
          existingAccessory.displayName
        );
        existingAccessory.context = {
          name: deviceName,
          child: true,
          parent: parent.UUID
        };

        const registeredAccessory = this.registerChild(
          existingAccessory,
          deviceInfo,
          parent
        );

        if (!registeredAccessory) {
          this.log.error(
            'Failed to register child accessory "%s" of type "%s" (%s)',
            deviceName,
            Accessory.GetChildType(deviceInfo),
            deviceInfo?.type
          );
          return;
        }

        this.registeredDevices.push(registeredAccessory);
        return;
      }

      this.log.info('Adding new child accessory:', deviceName);
      const accessory = new this.api.platformAccessory<HubContext>(
        deviceName,
        uuid
      );
      accessory.context = {
        name: deviceName,
        child: true,
        parent: parent.UUID
      };

      const registeredAccessory = this.registerChild(
        accessory,
        deviceInfo,
        parent
      );
      if (!registeredAccessory) {
        this.log.error(
          'Failed to register child accessory "%s" of type "%s" (%s)',
          deviceName,
          Accessory.GetChildType(deviceInfo),
          deviceInfo?.type
        );
        return;
      }

      this.registeredDevices.push(registeredAccessory);

      return this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
        accessory
      ]);
    } catch (err: any) {
      this.log.debug(
        'Failed to get info about child %s: %s',
        id,
        err?.message ?? String(err)
      );
      this.deviceRetry[uuid] -= 1;
      return await this.loadChildDevice(id, deviceInfo, parent);
    }
  }

  private checkOldDevices() {
    const addressesByUUID: Record<string, string> = (
      (this.config?.addresses as string[]) || []
    ).reduce(
      (acc, ip) => ({
        ...acc,
        [this.api.hap.uuid.generate(ip)]: ip
      }),
      {}
    );

    this.accessories.map((accessory) => {
      const deleteDevice =
        (!accessory.context.child &&
          !addressesByUUID[accessory.UUID.toString()]) ||
        (accessory.context.child &&
          !addressesByUUID[accessory.context.parent]) ||
        (accessory.context.child &&
          addressesByUUID[accessory.context.parent] &&
          !this.loadedChildUUIDs[accessory.UUID.toString()]);

      if (deleteDevice) {
        this.log.info('Remove cached accessory:', accessory.displayName);
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
          accessory
        ]);
      }
    });
  }

  private readonly accessoryClasses = {
    [AccessoryType.LightBulb]: LightBulbAccessory,
    [AccessoryType.Outlet]: OutletAccessory,
    [AccessoryType.Hub]: HubAccessory
  };

  private registerAccessory(
    accessory: PlatformAccessory<Context | HubContext>,
    deviceInfo: DeviceInfo
  ): Accessory | null {
    const AccessoryClass = this.accessoryClasses[Accessory.GetType(deviceInfo)];
    if (!AccessoryClass) {
      return null;
    }

    const acc = new AccessoryClass(this, accessory, this.log, deviceInfo);

    if (acc instanceof HubAccessory) {
      const alreadyTracked = this.hubs.some((h) => h.UUID === acc.UUID);
      if (!alreadyTracked) {
        this.hubs.push(acc);
      }
    }

    return acc;
  }

  private readonly childClasses = {
    [ChildType.Button]: ButtonAccessory,
    [ChildType.Contact]: ContactAccessory,
    [ChildType.MotionSensor]: MotionSensorAccessory,
  };

  private registerChild(
    accessory: PlatformAccessory<Context | HubContext>,
    deviceInfo: ChildInfo,
    parent: HubAccessory
  ): Accessory | null {
    const ChildClass = this.childClasses[Accessory.GetChildType(deviceInfo)];
    if (!ChildClass) {
      return null;
    }

    return new ChildClass(parent, this, accessory, this.log, deviceInfo);
  }
}
