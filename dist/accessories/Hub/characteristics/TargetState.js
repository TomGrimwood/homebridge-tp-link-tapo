"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const errors_1 = require("../../../utils/errors");
const characteristic = {
    get: async function () {
        const deviceInfo = await this.tpLink.getInfo();
        return deviceInfo.in_alarm
            ? this.Characteristic.SecuritySystemTargetState.AWAY_ARM
            : this.Characteristic.SecuritySystemTargetState.DISARM;
    },
    set: async function (value) {
        try {
            await this.setAlarmEnabled(this.Characteristic.SecuritySystemTargetState.AWAY_ARM === value);
        }
        catch (err) {
            const summary = (0, errors_1.errorSummary)(err);
            if ((0, errors_1.isNetworkError)(err)) {
                this.log.debug('[%s] set alarm state skipped (offline): %s', this.mac, summary);
            }
            else {
                this.log.warn('[%s] set alarm state failed: %s', this.mac, summary);
            }
        }
    }
};
exports.default = characteristic;
//# sourceMappingURL=TargetState.js.map