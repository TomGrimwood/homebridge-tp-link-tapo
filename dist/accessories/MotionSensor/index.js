"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const Accessory_1 = __importDefault(require("../../@types/Accessory"));
const delay_1 = __importDefault(require("../../utils/delay"));
const StatusLowBattery_1 = __importDefault(require("./characteristics/StatusLowBattery"));
const StatusActive_1 = __importDefault(require("./characteristics/StatusActive"));
class MotionSensorAccessory extends Accessory_1.default {
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
        const service = this.accessory.getService(this.platform.Service.MotionSensor) ||
            this.accessory.addService(this.platform.Service.MotionSensor);
        const motionDetected = service.getCharacteristic(this.platform.Characteristic.MotionDetected);
        const isActive = service.getCharacteristic(this.platform.Characteristic.StatusActive)
            .onGet(StatusActive_1.default.get.bind(this));
        service
            .getCharacteristic(this.platform.Characteristic.StatusLowBattery)
            .onGet(StatusLowBattery_1.default.get.bind(this));
        const checkStatus = async (initStatus) => {
            if (initStatus) {
                motionDetected.updateValue(initStatus.detected);
                isActive.updateValue(initStatus.active);
            }
            try {
                const response = await this.getInfo();
                if (!response) {
                    this.log.debug('[%s] motion poll: no response, backing off', this.mac);
                    await (0, delay_1.default)(500);
                    return;
                }
                motionDetected.updateValue(response.detected);
            }
            catch (error) {
                this.log.debug('[%s] motion poll failed: %s', this.mac, error instanceof Error ? error.message : String(error));
                await (0, delay_1.default)(500);
            }
        };
        this.setup(checkStatus.bind(this));
    }
    cleanup() {
        clearInterval(this.interval);
    }
    async setup(callback) {
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
exports.default = MotionSensorAccessory;
//# sourceMappingURL=index.js.map