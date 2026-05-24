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
const async_lock_1 = __importDefault(require("async-lock"));
const Protocol_1 = __importDefault(require("./@types/Protocol"));
const LegacyAPI_1 = __importDefault(require("./LegacyAPI"));
const commands_1 = __importDefault(require("./commands"));
const KlapAPI_1 = __importDefault(require("./KlapAPI"));
const DeviceInfoStore_1 = __importStar(require("./DeviceInfoStore"));
const errors_1 = require("../utils/errors");
class TPLink {
    get protocol() {
        return this._protocol;
    }
    constructor(ip, email, password, log) {
        this.ip = ip;
        this.email = email;
        this.password = password;
        this.log = log;
        this._protocol = Protocol_1.default.Legacy;
        this.state = new DeviceInfoStore_1.default();
        this.classSetup = false;
        this.tryResendCommand = false;
        this._prevPowerState = false;
        this._unsentData = {};
        this.commandCache = {};
        this.childInfoCache = {};
        this.lock = new async_lock_1.default();
        this.api = new LegacyAPI_1.default(ip, email, password, log);
    }
    async setup() {
        try {
            if (this.classSetup) {
                return this;
            }
            await this.api.setup();
            this._protocol = await this.checkProtocol();
            if (this._protocol === Protocol_1.default.KLAP) {
                this.api = new KlapAPI_1.default(this.ip, this.email, this.password, this.log);
                await this.api.setup();
            }
            this.classSetup = true;
        }
        catch (e) {
            if ((0, errors_1.isNetworkError)(e)) {
                this.log.debug('[%s] setup skipped: %s', this.ip, (0, errors_1.errorSummary)(e));
            }
            else {
                this.log.error('[%s] setup failed: %s', this.ip, (0, errors_1.errorSummary)(e));
                this.log.debug('[%s] full setup error:', this.ip, e);
            }
        }
        return this;
    }
    async cacheSendCommand(deviceId, command, ...args) {
        const cacheKey = `${deviceId}-${command}`;
        return this.lock.acquire(`cache-${cacheKey}`, async () => {
            var _a;
            if (this.commandCache[cacheKey.toString()] &&
                Date.now() - this.commandCache[cacheKey.toString()].setAt < 100) {
                return this.commandCache[cacheKey.toString()].data;
            }
            const response = (_a = (await this.sendCommand(command, ...args))) !== null && _a !== void 0 ? _a : {};
            this.commandCache[cacheKey.toString()] = {
                data: response,
                setAt: Date.now()
            };
            return response;
        });
    }
    getStateSnapshot() {
        return this.state.snapshot();
    }
    enableHomeKitStateSync(initial) {
        this.state.seed(initial);
        this.state.startSync(() => this.fetchDeviceInfo());
    }
    stopHomeKitStateSync() {
        this.state.stopSync();
    }
    async getInfo() {
        return this.state.refresh(() => this.fetchDeviceInfo());
    }
    async fetchDeviceInfo() {
        var _a, _b;
        const deviceInfo = (_a = (await this.sendCommand('deviceInfo'))) !== null && _a !== void 0 ? _a : {};
        if (Object.keys(deviceInfo).length === 0) {
            return null;
        }
        this._prevPowerState = (_b = deviceInfo.device_on) !== null && _b !== void 0 ? _b : false;
        return deviceInfo;
    }
    async getChildInfo(childId) {
        return this.lock.acquire('get-child-info-cache', async () => {
            var _a, _b, _c;
            if (this.childInfoCache[childId.toString()] &&
                Date.now() - this.childInfoCache[childId.toString()].setAt < 10000) {
                return this.childInfoCache[childId.toString()].data;
            }
            const rawInfo = (_a = (await this.sendCommand('childDeviceInfo', childId))) !== null && _a !== void 0 ? _a : {};
            const deviceInfo = (_c = (_b = rawInfo === null || rawInfo === void 0 ? void 0 : rawInfo.responseData) === null || _b === void 0 ? void 0 : _b.result) !== null && _c !== void 0 ? _c : {};
            this.childInfoCache[childId.toString()] = {
                data: deviceInfo,
                setAt: Date.now()
            };
            return deviceInfo;
        });
    }
    async sendCommand(command, ...args) {
        return this.lock.acquire('send-command', () => {
            if (command === 'power') {
                if (args[0] === this._prevPowerState) {
                    return this._prevPowerState;
                }
                this._prevPowerState = args[0];
            }
            return this.sendCommandWithNoLock(command, args, this._prevPowerState);
        });
    }
    async sendHubCommand(command, childId, ...args) {
        return this.lock.acquire(`send-hub-command-${childId}`, () => {
            return this.sendCommandWithNoLock(command, args, false);
        });
    }
    async sendCommandWithNoLock(command, args, isDeviceOn = false) {
        var _a;
        try {
            if (!commands_1.default[command.toString()]) {
                return false;
            }
            if (this.api.needsNewHandshake() || this.tryResendCommand) {
                if (this.tryResendCommand) {
                    this.log.debug('[%s] re-authenticating', this.ip);
                }
                await this.api.login();
            }
            const { __method__, ...params } = commands_1.default[command.toString()](...args);
            const validMethod = __method__ !== null && __method__ !== void 0 ? __method__ : 'set_device_info';
            if (!isDeviceOn && validMethod === 'set_device_info') {
                const paramsToCache = { ...params };
                delete paramsToCache.device_on;
                if (command === 'colorTemp') {
                    delete this._unsentData.saturation;
                    delete this._unsentData.hue;
                }
                this._unsentData = {
                    ...this._unsentData,
                    ...paramsToCache
                };
                if (command !== 'power') {
                    this.tryResendCommand = false;
                    this.applyCommandToState(command, args);
                    return true;
                }
            }
            const extraData = isDeviceOn && validMethod === 'set_device_info'
                ? { ...this._unsentData }
                : {};
            if (isDeviceOn) {
                this._unsentData = {};
            }
            const { body } = await this.api.sendSecureRequest(validMethod, {
                ...extraData,
                ...params
            }, true, false);
            if (body.error_code && body.error_code !== 0) {
                if (!this.tryResendCommand) {
                    if (`${body.error_code}` === '9999') {
                        this.tryResendCommand = true;
                        this.log.debug('[%s] session expired, retrying %s', this.ip, command);
                        return this.sendCommandWithNoLock(command, args, isDeviceOn);
                    }
                    if (`${body.error_code}` === '-1301') {
                        this.tryResendCommand = true;
                        this.log.debug('[%s] rate-limited, renewing session and retrying %s', this.ip, command);
                        return this.sendCommandWithNoLock(command, args, isDeviceOn);
                    }
                }
                this.log.warn('[%s] %s returned error_code %s', this.ip, command, body.error_code);
            }
            this.tryResendCommand = false;
            const succeeded = ((_a = body === null || body === void 0 ? void 0 : body.result) !== null && _a !== void 0 ? _a : (body === null || body === void 0 ? void 0 : body.error_code) === 0);
            if (succeeded) {
                this.applyCommandToState(command, args);
            }
            return succeeded;
        }
        catch (e) {
            if ((0, errors_1.isNetworkError)(e)) {
                this.log.debug('[%s] %s skipped, device unreachable: %s', this.ip, command, (0, errors_1.errorSummary)(e));
            }
            else {
                this.log.warn('[%s] %s failed: %s', this.ip, command, (0, errors_1.errorSummary)(e));
                this.log.debug('[%s] full error for %s:', this.ip, command, e);
            }
            this.tryResendCommand = false;
            return null;
        }
    }
    applyCommandToState(command, args) {
        const patch = (0, DeviceInfoStore_1.patchFromCommand)(command, args);
        if (patch) {
            this.state.patch(patch);
        }
    }
    async checkProtocol() {
        try {
            const response = await this.api.sendRequest('component_nego', {}, false);
            if (response.data.error_code === 1003) {
                this.log.debug('[%s] protocol: KLAP', this.ip);
                return Protocol_1.default.KLAP;
            }
        }
        catch (e) {
            this.log.debug('[%s] protocol probe failed (%s), defaulting to legacy', this.ip, (0, errors_1.errorSummary)(e));
        }
        this.log.debug('[%s] protocol: legacy', this.ip);
        return Protocol_1.default.Legacy;
    }
}
exports.default = TPLink;
//# sourceMappingURL=TPLink.js.map