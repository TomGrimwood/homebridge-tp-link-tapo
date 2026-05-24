"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const characteristic = {
    get: async function () {
        const deviceInfo = this.tpLink.getStateSnapshot();
        return deviceInfo.in_alarm
            ? this.Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED
            : this.Characteristic.SecuritySystemCurrentState.DISARMED;
    }
};
exports.default = characteristic;
//# sourceMappingURL=CurrentState.js.map