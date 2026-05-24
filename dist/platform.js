"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const Accessory_1 = __importStar(require("./@types/Accessory"));
const settings_1 = require("./settings");
const TPLink_1 = __importDefault(require("./api/TPLink"));
const delay_1 = __importDefault(require("./utils/delay"));
const Hub_1 = __importDefault(require("./accessories/Hub"));
const LightBulb_1 = __importDefault(require("./accessories/LightBulb"));
const Outlet_1 = __importDefault(require("./accessories/Outlet"));
const Button_1 = __importDefault(require("./accessories/Button"));
const Contact_1 = __importDefault(require("./accessories/Contact"));
const MotionSensor_1 = __importDefault(require("./accessories/MotionSensor"));
class Platform {
    constructor(log, config, api) {
        this.log = log;
        this.config = config;
        this.api = api;
        // Initial connect attempts at startup. Kept low so Homebridge boots
        // quickly even when some devices are offline; background reconnects
        // continue indefinitely (see RECONNECT_INTERVAL_MS).
        this.TIMEOUT_TRIES = 3;
        // How often to retry offline devices in the background. Tapo devices
        // need ~10s from power-on to be responsive, so polling faster than
        // that is wasted effort. 10s gives ~5s average latency between a
        // device coming back online and HomeKit picking it up.
        // Passes are single-attempt-per-device, parallel, and guarded by
        // `reconnectInProgress`, so the interval is genuinely the bound on
        // user-visible latency rather than a thrash knob.
        this.RECONNECT_INTERVAL_MS = 10 * 1000;
        this.Service = this.api.hap.Service;
        this.Characteristic = this.api.hap.Characteristic;
        this.accessories = [];
        this.loadedChildUUIDs = {};
        this.registeredDevices = [];
        this.hubs = [];
        this.connectedDevices = new Set();
        this.deviceRetry = {};
        // Tracks IPs that finished their startup retries without succeeding.
        // The background reconnect loop will keep trying these forever.
        this.offlineAddresses = new Set();
        // Guard so a slow reconnect pass cannot overlap with the next tick.
        this.reconnectInProgress = false;
        this.accessoryClasses = {
            [Accessory_1.AccessoryType.LightBulb]: LightBulb_1.default,
            [Accessory_1.AccessoryType.Outlet]: Outlet_1.default,
            [Accessory_1.AccessoryType.Hub]: Hub_1.default
        };
        this.childClasses = {
            [Accessory_1.ChildType.Button]: Button_1.default,
            [Accessory_1.ChildType.Contact]: Contact_1.default,
            [Accessory_1.ChildType.MotionSensor]: MotionSensor_1.default,
        };
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
            for (const tpLink of this.connectedDevices) {
                tpLink.stopHomeKitStateSync();
            }
        });
    }
    startReconnectLoop() {
        var _a, _b;
        if (this.reconnectTimer) {
            return;
        }
        this.reconnectTimer = setInterval(() => {
            void this.reconnectOfflineDevices();
        }, this.RECONNECT_INTERVAL_MS);
        // Don't keep the process alive solely for this timer.
        (_b = (_a = this.reconnectTimer).unref) === null || _b === void 0 ? void 0 : _b.call(_a);
    }
    async reconnectOfflineDevices() {
        var _a, _b;
        if (this.reconnectInProgress) {
            // Previous pass still running (unusual — a single pass should
            // finish in a few seconds). Skip this tick to avoid overlap.
            return;
        }
        const { email, password } = (_a = this.config) !== null && _a !== void 0 ? _a : {};
        if (!email || !password || this.offlineAddresses.size === 0) {
            return;
        }
        this.reconnectInProgress = true;
        try {
            const addresses = [...this.offlineAddresses];
            this.log.debug('Background reconnect: trying %d offline device(s)', addresses.length);
            // Single attempt per device per tick, in parallel. Each attempt
            // is just a TCP connect + key exchange — failures return in
            // ~1-3s (EHOSTUNREACH after ARP), so the whole pass is fast
            // even with many offline devices.
            await Promise.all(addresses.map(async (ip) => {
                var _a;
                try {
                    await this.loadDevice(ip, email, password, true);
                }
                catch (err) {
                    this.log.debug('Background reconnect attempt failed for %s: %s', ip, (_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : String(err));
                }
            }));
            // Re-scan hubs in case a hub came back online and brought
            // children with it.
            if (this.hubs.length > 0) {
                try {
                    await Promise.all(this.hubs.map(async (hub) => {
                        const devices = await hub.getChildDevices();
                        await Promise.all(devices.map((device) => {
                            if (Object.keys(device || {}).length === 0) {
                                return Promise.resolve();
                            }
                            const childUuid = this.api.hap.uuid.generate(device.device_id);
                            if (this.loadedChildUUIDs[childUuid]) {
                                return Promise.resolve();
                            }
                            this.loadedChildUUIDs[childUuid] = true;
                            return this.loadChildDevice(device.device_id, device, hub);
                        }));
                    }));
                }
                catch (err) {
                    this.log.debug('Background reconnect hub child sweep failed: %s', (_b = err === null || err === void 0 ? void 0 : err.message) !== null && _b !== void 0 ? _b : String(err));
                }
            }
        }
        finally {
            this.reconnectInProgress = false;
        }
    }
    configureAccessory(accessory) {
        this.log.info('Loading accessory from cache:', accessory.displayName);
        this.accessories.push(accessory);
    }
    async discoverDevices() {
        var _a;
        try {
            const { email, password, addresses } = (_a = this.config) !== null && _a !== void 0 ? _a : {};
            if (!email ||
                !password ||
                !addresses ||
                !Array.isArray(addresses) ||
                addresses.length <= 0) {
                if (this.accessories.length > 0) {
                    this.api.unregisterPlatformAccessories(settings_1.PLUGIN_NAME, settings_1.PLATFORM_NAME, this.accessories);
                }
                return;
            }
            await Promise.all(addresses.map((address) => this.loadDevice(address, email, password)));
            await Promise.all(this.hubs.map(async (hub) => {
                const devices = await hub.getChildDevices();
                await Promise.all(devices.map((device) => {
                    if (Object.keys(device || {}).length === 0) {
                        return Promise.resolve();
                    }
                    this.loadedChildUUIDs[this.api.hap.uuid.generate(device.device_id)] = true;
                    return this.loadChildDevice(device.device_id, device, hub);
                }));
            }));
            this.checkOldDevices();
        }
        catch (err) {
            this.log.error('Discovery failed: %s', err instanceof Error ? err.message : String(err));
            this.log.debug('Full discovery error:', err);
        }
    }
    async loadDevice(ip, email, password, singleAttempt = false) {
        var _a;
        const uuid = this.api.hap.uuid.generate(ip);
        if (!singleAttempt) {
            // Startup path: retry up to TIMEOUT_TRIES with 10s delays between
            // attempts before deferring to the background reconnect loop.
            if (this.deviceRetry[uuid] === undefined) {
                this.deviceRetry[uuid] = this.TIMEOUT_TRIES;
            }
            else if (this.deviceRetry[uuid] <= 0) {
                this.offlineAddresses.add(ip);
                this.log.info('%s is offline; will keep trying in the background every %ds.', ip, Math.round(this.RECONNECT_INTERVAL_MS / 1000));
                return;
            }
            else {
                this.log.debug('Retrying %s in 10s (%d/%d)', ip, this.deviceRetry[uuid], this.TIMEOUT_TRIES);
                await (0, delay_1.default)(10 * 1000);
            }
        }
        try {
            const tpLink = await new TPLink_1.default(ip, email, password, this.log).setup();
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
            const deviceName = Buffer.from((deviceInfo === null || deviceInfo === void 0 ? void 0 : deviceInfo.nickname) || 'Tm8gTmFtZQ==', 'base64').toString('utf-8');
            const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);
            if (existingAccessory) {
                this.log.info('Restored "%s" (%s) from cache', existingAccessory.displayName, ip);
                existingAccessory.context = {
                    name: deviceName,
                    tpLink,
                    child: false
                };
                const registeredAccessory = this.registerAccessory(existingAccessory, deviceInfo);
                if (!registeredAccessory) {
                    this.log.error('Failed to register accessory "%s" of type "%s" (%s)', deviceName, Accessory_1.default.GetType(deviceInfo), deviceInfo === null || deviceInfo === void 0 ? void 0 : deviceInfo.type);
                    return;
                }
                this.registeredDevices.push(registeredAccessory);
                return;
            }
            this.log.info('Added new accessory "%s" (%s)', deviceName, ip);
            const accessory = new this.api.platformAccessory(deviceName, uuid);
            accessory.context = {
                name: deviceName,
                tpLink,
                child: false
            };
            const registeredAccessory = this.registerAccessory(accessory, deviceInfo);
            if (!registeredAccessory) {
                this.log.error('Failed to register accessory "%s" of type "%s" (%s)', deviceName, Accessory_1.default.GetType(deviceInfo), deviceInfo === null || deviceInfo === void 0 ? void 0 : deviceInfo.type);
                return;
            }
            this.registeredDevices.push(registeredAccessory);
            return this.api.registerPlatformAccessories(settings_1.PLUGIN_NAME, settings_1.PLATFORM_NAME, [
                accessory
            ]);
        }
        catch (err) {
            this.log.debug('Failed to get info about %s: %s', ip, (_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : String(err));
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
    async loadChildDevice(id, deviceInfo, parent) {
        var _a;
        const uuid = this.api.hap.uuid.generate(id);
        if (this.deviceRetry[uuid] === undefined) {
            this.deviceRetry[uuid] = this.TIMEOUT_TRIES;
        }
        else if (this.deviceRetry[uuid] <= 0) {
            this.log.debug('Child device %s not ready; background reconnect will retry.', id);
            return;
        }
        else {
            this.log.debug('Retrying child %s in 10s (%d/%d)', id, this.deviceRetry[uuid], this.TIMEOUT_TRIES);
            await (0, delay_1.default)(10 * 1000);
        }
        try {
            const deviceName = Buffer.from(deviceInfo.nickname || 'Tm8gTmFtZQ==', 'base64').toString('utf-8');
            const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);
            if (existingAccessory) {
                this.log.info('Restoring existing child accessory from cache:', existingAccessory.displayName);
                existingAccessory.context = {
                    name: deviceName,
                    child: true,
                    parent: parent.UUID
                };
                const registeredAccessory = this.registerChild(existingAccessory, deviceInfo, parent);
                if (!registeredAccessory) {
                    this.log.error('Failed to register child accessory "%s" of type "%s" (%s)', deviceName, Accessory_1.default.GetChildType(deviceInfo), deviceInfo === null || deviceInfo === void 0 ? void 0 : deviceInfo.type);
                    return;
                }
                this.registeredDevices.push(registeredAccessory);
                return;
            }
            this.log.info('Adding new child accessory:', deviceName);
            const accessory = new this.api.platformAccessory(deviceName, uuid);
            accessory.context = {
                name: deviceName,
                child: true,
                parent: parent.UUID
            };
            const registeredAccessory = this.registerChild(accessory, deviceInfo, parent);
            if (!registeredAccessory) {
                this.log.error('Failed to register child accessory "%s" of type "%s" (%s)', deviceName, Accessory_1.default.GetChildType(deviceInfo), deviceInfo === null || deviceInfo === void 0 ? void 0 : deviceInfo.type);
                return;
            }
            this.registeredDevices.push(registeredAccessory);
            return this.api.registerPlatformAccessories(settings_1.PLUGIN_NAME, settings_1.PLATFORM_NAME, [
                accessory
            ]);
        }
        catch (err) {
            this.log.debug('Failed to get info about child %s: %s', id, (_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : String(err));
            this.deviceRetry[uuid] -= 1;
            return await this.loadChildDevice(id, deviceInfo, parent);
        }
    }
    checkOldDevices() {
        var _a;
        const addressesByUUID = (((_a = this.config) === null || _a === void 0 ? void 0 : _a.addresses) || []).reduce((acc, ip) => ({
            ...acc,
            [this.api.hap.uuid.generate(ip)]: ip
        }), {});
        this.accessories.map((accessory) => {
            const deleteDevice = (!accessory.context.child &&
                !addressesByUUID[accessory.UUID.toString()]) ||
                (accessory.context.child &&
                    !addressesByUUID[accessory.context.parent]) ||
                (accessory.context.child &&
                    addressesByUUID[accessory.context.parent] &&
                    !this.loadedChildUUIDs[accessory.UUID.toString()]);
            if (deleteDevice) {
                this.log.info('Remove cached accessory:', accessory.displayName);
                this.api.unregisterPlatformAccessories(settings_1.PLUGIN_NAME, settings_1.PLATFORM_NAME, [
                    accessory
                ]);
            }
        });
    }
    registerAccessory(accessory, deviceInfo) {
        const AccessoryClass = this.accessoryClasses[Accessory_1.default.GetType(deviceInfo)];
        if (!AccessoryClass) {
            return null;
        }
        const acc = new AccessoryClass(this, accessory, this.log, deviceInfo);
        const { tpLink } = accessory.context;
        this.trackConnectedDevice(tpLink);
        tpLink.enableHomeKitStateSync(deviceInfo);
        if (acc instanceof Hub_1.default) {
            const alreadyTracked = this.hubs.some((h) => h.UUID === acc.UUID);
            if (!alreadyTracked) {
                this.hubs.push(acc);
            }
        }
        return acc;
    }
    registerChild(accessory, deviceInfo, parent) {
        const ChildClass = this.childClasses[Accessory_1.default.GetChildType(deviceInfo)];
        if (!ChildClass) {
            return null;
        }
        return new ChildClass(parent, this, accessory, this.log, deviceInfo);
    }
    trackConnectedDevice(tpLink) {
        this.connectedDevices.add(tpLink);
    }
}
exports.default = Platform;
//# sourceMappingURL=platform.js.map