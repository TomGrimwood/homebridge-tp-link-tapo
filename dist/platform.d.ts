import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';
import Accessory from './@types/Accessory';
import Context from './@types/Context';
import HubAccessory, { HubContext } from './accessories/Hub';
export default class Platform implements DynamicPlatformPlugin {
    readonly log: Logger;
    readonly config: PlatformConfig;
    readonly api: API;
    private readonly TIMEOUT_TRIES;
    private readonly RECONNECT_INTERVAL_MS;
    readonly Service: typeof Service;
    readonly Characteristic: typeof Characteristic;
    readonly accessories: PlatformAccessory<Context | HubContext>[];
    readonly loadedChildUUIDs: Record<string, true>;
    readonly registeredDevices: Accessory[];
    readonly hubs: HubAccessory[];
    private readonly deviceRetry;
    private readonly offlineAddresses;
    private reconnectTimer?;
    private reconnectInProgress;
    constructor(log: Logger, config: PlatformConfig, api: API);
    private startReconnectLoop;
    private reconnectOfflineDevices;
    configureAccessory(accessory: PlatformAccessory<Context>): void;
    private discoverDevices;
    private loadDevice;
    private loadChildDevice;
    private checkOldDevices;
    private readonly accessoryClasses;
    private registerAccessory;
    private readonly childClasses;
    private registerChild;
}
//# sourceMappingURL=platform.d.ts.map