"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const readState_1 = require("../../readState");
const characteristic = {
    get: (0, readState_1.readState)((info) => info.hue || 0),
    set: async function (value) {
        this.hue = parseInt(value.toString());
    }
};
exports.default = characteristic;
//# sourceMappingURL=Hue.js.map