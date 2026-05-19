"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const crypto_1 = __importDefault(require("crypto"));
const axios_1 = __importDefault(require("axios"));
const http_1 = __importDefault(require("http"));
const TpLinkCipher_1 = __importDefault(require("./TpLinkCipher"));
const API_1 = __importDefault(require("./@types/API"));
class LegacyAPI extends API_1.default {
    constructor() {
        super(...arguments);
        this.handshakeData = {
            expire: 0
        };
        this.classSetup = false;
    }
    async login() {
        var _a;
        const { body } = await this.sendSecureRequest('login_device', {
            username: this.email,
            password: this.password
        }, false, true);
        // Intentionally NOT logging the login response body — it contains
        // credentials and session tokens.
        this.log.debug('[%s] login ok', this.ip);
        this.loginToken = (_a = body === null || body === void 0 ? void 0 : body.result) === null || _a === void 0 ? void 0 : _a.token;
    }
    async setup() {
        const keys = await TpLinkCipher_1.default.createKeyPair();
        this.publicKey = keys.public;
        this.privateKey = keys.private;
        this.classSetup = true;
    }
    async sendRequest(method, params, setCookie = false) {
        var _a;
        const response = await axios_1.default.post(`http://${this.ip}/app`, JSON.stringify({
            method,
            params,
            requestTimeMils: Date.now()
        }), {
            headers: {
                'Content-Type': 'application/json',
                ...(setCookie && this.handshakeData.cookie
                    ? {
                        Cookie: this.handshakeData.cookie
                    }
                    : {})
            },
            httpAgent: new http_1.default.Agent({
                keepAlive: false
            })
        });
        this.log.debug('[%s] %s -> error_code=%s', this.ip, method, (_a = response.data) === null || _a === void 0 ? void 0 : _a.error_code);
        return response;
    }
    async sendSecureRequest(method, params, useToken = false, forceHandshake = false) {
        var _a, _b, _c;
        if (forceHandshake) {
            await this.handshake();
        }
        else {
            if (this.needsNewHandshake()) {
                await this.handshake();
            }
        }
        try {
            const response = await axios_1.default.post(`http://${this.ip}/app${useToken ? `?token=${this.loginToken}` : ''}`, JSON.stringify({
                method: 'securePassthrough',
                params: {
                    request: this.tpLinkCipher.encrypt(JSON.stringify({
                        method,
                        params,
                        requestTimeMils: Date.now(),
                        terminalUUID: this.terminalUUID
                    }))
                }
            }), {
                headers: {
                    'Content-Type': 'application/json',
                    Cookie: this.handshakeData.cookie
                },
                httpAgent: new http_1.default.Agent({
                    keepAlive: false
                })
            });
            let body = response === null || response === void 0 ? void 0 : response.data;
            if ((_a = body === null || body === void 0 ? void 0 : body.result) === null || _a === void 0 ? void 0 : _a.response) {
                body = JSON.parse(this.tpLinkCipher.decrypt(body.result.response));
            }
            this.log.debug('[%s] %s -> error_code=%s', this.ip, method, body === null || body === void 0 ? void 0 : body.error_code);
            return {
                response,
                body
            };
        }
        catch (error) {
            if (((_b = error.response) === null || _b === void 0 ? void 0 : _b.status) === 403 && !forceHandshake) {
                this.log.debug('[%s] %s -> 403, regenerating token and retrying', this.ip, method);
                return this.sendSecureRequest(method, params, useToken, true);
            }
            throw new Error(`Request failed: ${(_c = error === null || error === void 0 ? void 0 : error.message) !== null && _c !== void 0 ? _c : error}`);
        }
    }
    needsNewHandshake() {
        if (!this.classSetup) {
            throw new Error('Execute the .setup() first!');
        }
        if (!this.loginToken) {
            return true;
        }
        if (!this.tpLinkCipher) {
            return true;
        }
        if (this.handshakeData.expire - Date.now() <= 40 * 1000) {
            return true;
        }
        if (!this.handshakeData.cookie) {
            return true;
        }
        return false;
    }
    async handshake() {
        var _a, _b, _c, _d, _e, _f, _g;
        const response = await this.sendRequest('handshake', {
            key: this.publicKey
        });
        const key = (_b = (_a = response === null || response === void 0 ? void 0 : response.data) === null || _a === void 0 ? void 0 : _a.result) === null || _b === void 0 ? void 0 : _b.key;
        if (!key) {
            throw new Error('Failed to handshake with device');
        }
        this.log.debug('[%s] handshake ok', this.ip);
        const [cookie, timeout] = (_f = (_e = (_d = (_c = response === null || response === void 0 ? void 0 : response.headers) === null || _c === void 0 ? void 0 : _c['set-cookie']) === null || _d === void 0 ? void 0 : _d[0]) === null || _e === void 0 ? void 0 : _e.split(';')) !== null && _f !== void 0 ? _f : [];
        const expire = parseInt((_g = (timeout !== null && timeout !== void 0 ? timeout : '').split('=')[1]) !== null && _g !== void 0 ? _g : '0');
        this.handshakeData.expire = Date.now() + expire * 1000;
        this.handshakeData.cookie = cookie;
        this.tpLinkCipher = this.decodeHandshakeKey(key);
    }
    decodeHandshakeKey(key) {
        if (!this.classSetup) {
            throw new Error('Execute the .setup() first!');
        }
        const decodedKey = Buffer.from(key, 'base64');
        const decrypted = crypto_1.default.privateDecrypt({
            key: this.privateKey,
            padding: crypto_1.default.constants.RSA_PKCS1_PADDING
        }, decodedKey);
        const keyLen = 16;
        return new TpLinkCipher_1.default(decrypted.subarray(0, keyLen), decrypted.subarray(keyLen, keyLen * 2));
    }
}
exports.default = LegacyAPI;
//# sourceMappingURL=LegacyAPI.js.map