"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const crypto_1 = __importDefault(require("crypto"));
const TpLinkCipher_1 = __importDefault(require("../TpLinkCipher"));
class API {
    constructor(ip, email, password, log) {
        this.ip = ip;
        this.email = email;
        this.password = password;
        this.log = log;
        this.email = TpLinkCipher_1.default.toBase64(TpLinkCipher_1.default.encodeUsername(this.email));
        this.password = TpLinkCipher_1.default.toBase64(this.password);
        this.terminalUUID = crypto_1.default.randomUUID();
        this.rawEmail = email;
        this.rawPassword = password;
    }
}
exports.default = API;
//# sourceMappingURL=API.js.map