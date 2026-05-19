"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Status = void 0;
const Accessory_1 = __importDefault(require("../../@types/Accessory"));
const delay_1 = __importDefault(require("../../utils/delay"));
const StatusLowBattery_1 = __importDefault(require("./characteristics/StatusLowBattery"));
var Status;
(function (Status) {
    Status["KeepOpen"] = "keepOpen";
    Status["Closed"] = "close";
    Status["Open"] = "open";
})(Status || (exports.Status = Status = {}));
class ContactAccessory extends Accessory_1.default {
    get UUID() {
        return this.accessory.UUID.toString();
    }
    getInfo() {
        return this.hub.getChildInfo(this.deviceInfo.device_id);
    }
    constructor(hub, platform, accessory, log, deviceInfo) {
        super(platform, accessory, log, deviceInfo);
        this.hub = hub;
        this.lastEventUpdate = 0;
        this.accessory
            .getService(this.platform.Service.AccessoryInformation)
            .setCharacteristic(this.platform.Characteristic.Manufacturer, 'TP-Link Technologies')
            .setCharacteristic(this.platform.Characteristic.Model, this.model)
            .setCharacteristic(this.platform.Characteristic.SerialNumber, this.mac);
        const service = this.accessory.getService(this.platform.Service.ContactSensor) ||
            this.accessory.addService(this.platform.Service.ContactSensor);
        const characteristic = service.getCharacteristic(this.platform.Characteristic.ContactSensorState);
        service
            .getCharacteristic(this.platform.Characteristic.StatusLowBattery)
            .onGet(StatusLowBattery_1.default.get.bind(this));
        const checkStatus = async (initStatus) => {
            var _a, _b;
            try {
                if (initStatus) {
                    characteristic.updateValue(this.statusToValue(initStatus));
                }
                const response = await this.hub.getChildLogs(this.deviceInfo.device_id);
                if (!response) {
                    this.log.warn('Failed to check for updates, delaying 500ms');
                    await (0, delay_1.default)(500);
                }
                const lastEvent = (_a = response === null || response === void 0 ? void 0 : response.logs) === null || _a === void 0 ? void 0 : _a[0];
                if (this.lastEventUpdate < (lastEvent === null || lastEvent === void 0 ? void 0 : lastEvent.timestamp)) {
                    this.lastEventUpdate = (_b = lastEvent === null || lastEvent === void 0 ? void 0 : lastEvent.timestamp) !== null && _b !== void 0 ? _b : 0;
                    characteristic.updateValue(this.statusToValue(lastEvent === null || lastEvent === void 0 ? void 0 : lastEvent.event));
                }
            }
            catch (error) {
                this.log.error('Failed to check for updates', error);
                await (0, delay_1.default)(500);
            }
            checkStatus();
        };
        this.setup((x) => checkStatus(x));
    }
    cleanup() {
        clearInterval(this.interval);
    }
    async setup(callback) {
        var _a, _b, _c;
        const init = await this.hub.getChildLogs(this.deviceInfo.device_id);
        const initEvent = (_a = init === null || init === void 0 ? void 0 : init.logs) === null || _a === void 0 ? void 0 : _a[0];
        this.lastEventUpdate = (_b = initEvent === null || initEvent === void 0 ? void 0 : initEvent.timestamp) !== null && _b !== void 0 ? _b : 0;
        callback((_c = initEvent === null || initEvent === void 0 ? void 0 : initEvent.event) !== null && _c !== void 0 ? _c : Status.KeepOpen);
    }
    statusToValue(status) {
        switch (status) {
            case Status.Open:
            case Status.KeepOpen:
                return this.platform.Characteristic.ContactSensorState
                    .CONTACT_NOT_DETECTED;
            default:
                return this.platform.Characteristic.ContactSensorState.CONTACT_DETECTED;
        }
    }
}
exports.default = ContactAccessory;
//# sourceMappingURL=index.js.map