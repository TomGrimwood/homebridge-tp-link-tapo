"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const async_lock_1 = __importDefault(require("async-lock"));
const Protocol_1 = __importDefault(require("./@types/Protocol"));
const LegacyAPI_1 = __importDefault(require("./LegacyAPI"));
const commands_1 = __importDefault(require("./commands"));
const KlapAPI_1 = __importDefault(require("./KlapAPI"));
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
        var _a, _b, _c, _d;
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
            const code = (_a = e === null || e === void 0 ? void 0 : e.code) !== null && _a !== void 0 ? _a : (_b = e === null || e === void 0 ? void 0 : e.cause) === null || _b === void 0 ? void 0 : _b.code;
            if (code && code !== 'ERR_BAD_REQUEST') {
                this.log.debug('Error setting up TPLink class for %s (%s): %s', this.ip, code, (_c = e === null || e === void 0 ? void 0 : e.message) !== null && _c !== void 0 ? _c : String(e));
            }
            else {
                this.log.error('Error setting up TPLink class for %s: %s', this.ip, (_d = e === null || e === void 0 ? void 0 : e.message) !== null && _d !== void 0 ? _d : String(e));
                this.log.debug('Full setup error for %s:', this.ip, e);
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
    async getInfo() {
        return this.lock.acquire('get-info-cache', async () => {
            var _a, _b;
            if (this.infoCache && Date.now() - this.infoCache.setAt < 100) {
                return this.infoCache.data;
            }
            const deviceInfo = (_a = (await this.sendCommand('deviceInfo'))) !== null && _a !== void 0 ? _a : {};
            this.infoCache = {
                data: deviceInfo,
                setAt: Date.now()
            };
            this._prevPowerState = (_b = deviceInfo.device_on) !== null && _b !== void 0 ? _b : false;
            return deviceInfo;
        });
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
        var _a, _b, _c, _d;
        try {
            if (!commands_1.default[command.toString()]) {
                return false;
            }
            if (this.api.needsNewHandshake() || this.tryResendCommand) {
                if (this.tryResendCommand) {
                    this.log.info('Trying to login again.');
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
                        this.log.info('Session expired');
                        return this.sendCommandWithNoLock(command, args, isDeviceOn);
                    }
                    if (`${body.error_code}` === '-1301') {
                        this.tryResendCommand = true;
                        this.log.info('Rate limit exceeded. Renewing session.');
                        return this.sendCommandWithNoLock(command, args, isDeviceOn);
                    }
                }
                this.log.error('Command error:', command, '>', body.error_code);
            }
            this.tryResendCommand = false;
            return ((_a = body === null || body === void 0 ? void 0 : body.result) !== null && _a !== void 0 ? _a : (body === null || body === void 0 ? void 0 : body.error_code) === 0);
        }
        catch (e) {
            const networkErrorCodes = new Set([
                'EHOSTUNREACH',
                'ECONNREFUSED',
                'ECONNRESET',
                'ECONNABORTED',
                'ETIMEDOUT',
                'ENETUNREACH',
                'ENOTFOUND'
            ]);
            const code = (_b = e === null || e === void 0 ? void 0 : e.code) !== null && _b !== void 0 ? _b : (_c = e === null || e === void 0 ? void 0 : e.cause) === null || _c === void 0 ? void 0 : _c.code;
            if (code && networkErrorCodes.has(code)) {
                // Device is unreachable (offline, powered off, etc). Avoid
                // dumping the full axios error object on every failed poll.
                this.log.debug('Device unreachable while sending %s to %s (%s).', command, this.ip, code);
            }
            else {
                this.log.error('Error sending command %s to %s: %s', command, this.ip, (_d = e === null || e === void 0 ? void 0 : e.message) !== null && _d !== void 0 ? _d : String(e));
                this.log.debug('Full error details for %s:', this.ip, e);
            }
            this.tryResendCommand = false;
            return null;
        }
    }
    async checkProtocol() {
        var _a;
        try {
            this.log.debug('Checking protocol');
            const response = await this.api.sendRequest('component_nego', {}, false);
            if (response.data.error_code === 1003) {
                this.log.debug(`Using KLAP protocol for ${this.ip}`);
                return Protocol_1.default.KLAP;
            }
        }
        catch (e) {
            this.log.debug('Protocol error response:', JSON.stringify(((_a = e === null || e === void 0 ? void 0 : e.response) === null || _a === void 0 ? void 0 : _a.data) || (e === null || e === void 0 ? void 0 : e.response) || e));
        }
        this.log.debug(`Using legacy protocol for ${this.ip}`);
        return Protocol_1.default.Legacy;
    }
}
exports.default = TPLink;
//# sourceMappingURL=TPLink.js.map