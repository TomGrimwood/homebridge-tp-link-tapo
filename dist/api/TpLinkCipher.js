"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const crypto_1 = __importDefault(require("crypto"));
class TpLinkCipher {
    constructor(key, iv) {
        this.key = key;
        this.iv = iv;
    }
    static toBase64(data) {
        return Buffer.from(data.normalize('NFKC'), 'utf-8').toString('base64');
    }
    static encodeUsername(data) {
        const sha = crypto_1.default.createHash('sha1');
        sha.update(data.normalize('NFKC'));
        return sha.digest('hex');
    }
    static createKeyPair() {
        return new Promise((resolve, reject) => {
            crypto_1.default.generateKeyPair('rsa', {
                modulusLength: 1024
            }, (err, publicK, privateK) => {
                if (err) {
                    return reject(err);
                }
                const pub = publicK
                    .export({
                    format: 'pem',
                    type: 'spki'
                })
                    .toString('base64');
                const priv = privateK
                    .export({
                    format: 'pem',
                    type: 'pkcs1'
                })
                    .toString('base64');
                resolve({
                    public: pub,
                    private: priv
                });
            });
        });
    }
    encrypt(data) {
        const cipher = crypto_1.default.createCipheriv('aes-128-cbc', this.key, this.iv);
        const encrypted = cipher.update(data, 'utf8', 'base64');
        return `${encrypted}${cipher.final('base64')}`;
    }
    decrypt(data) {
        const decipher = crypto_1.default.createDecipheriv('aes-128-cbc', this.key, this.iv);
        const decrypted = decipher.update(data, 'base64', 'utf8');
        return `${decrypted}${decipher.final('utf8')}`;
    }
}
exports.default = TpLinkCipher;
//# sourceMappingURL=TpLinkCipher.js.map