"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChildType = exports.AccessoryType = void 0;
var AccessoryType;
(function (AccessoryType) {
    AccessoryType["LightBulb"] = "LightBulb";
    AccessoryType["Unknown"] = "Unknown";
    AccessoryType["Outlet"] = "Outlet";
    AccessoryType["Hub"] = "Hub";
})(AccessoryType || (exports.AccessoryType = AccessoryType = {}));
var ChildType;
(function (ChildType) {
    ChildType["Unknown"] = "Unknown";
    ChildType["Button"] = "LightBulb";
    ChildType["Contact"] = "Contact";
    ChildType["MotionSensor"] = "MotionSensor";
})(ChildType || (exports.ChildType = ChildType = {}));
class Accessory {
    static GetType(deviceInfo) {
        var _a, _b, _c;
        if ((_a = deviceInfo === null || deviceInfo === void 0 ? void 0 : deviceInfo.type) === null || _a === void 0 ? void 0 : _a.includes('BULB')) {
            return AccessoryType.LightBulb;
        }
        if ((_b = deviceInfo === null || deviceInfo === void 0 ? void 0 : deviceInfo.type) === null || _b === void 0 ? void 0 : _b.includes('PLUG')) {
            return AccessoryType.Outlet;
        }
        if ((_c = deviceInfo === null || deviceInfo === void 0 ? void 0 : deviceInfo.type) === null || _c === void 0 ? void 0 : _c.includes('HUB')) {
            return AccessoryType.Hub;
        }
        return AccessoryType.Unknown;
    }
    static GetChildType(deviceInfo) {
        var _a, _b, _c, _d;
        if ((_a = deviceInfo === null || deviceInfo === void 0 ? void 0 : deviceInfo.type) === null || _a === void 0 ? void 0 : _a.includes('SENSOR')) {
            if ((_b = deviceInfo === null || deviceInfo === void 0 ? void 0 : deviceInfo.category) === null || _b === void 0 ? void 0 : _b.includes('button')) {
                return ChildType.Button;
            }
            if ((_c = deviceInfo === null || deviceInfo === void 0 ? void 0 : deviceInfo.category) === null || _c === void 0 ? void 0 : _c.includes('contact-sensor')) {
                return ChildType.Contact;
            }
            if ((_d = deviceInfo === null || deviceInfo === void 0 ? void 0 : deviceInfo.category) === null || _d === void 0 ? void 0 : _d.includes('motion-sensor')) {
                return ChildType.MotionSensor;
            }
        }
        return ChildType.Unknown;
    }
    constructor(platform, accessory, log, deviceInfo) {
        this.platform = platform;
        this.accessory = accessory;
        this.log = log;
        this.deviceInfo = deviceInfo;
        this.tpLink = accessory.context.tpLink;
        this.model = deviceInfo.model;
        this.mac = deviceInfo.mac;
    }
}
exports.default = Accessory;
//# sourceMappingURL=Accessory.js.map