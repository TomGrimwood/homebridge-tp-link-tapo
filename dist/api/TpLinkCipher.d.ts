export default class TpLinkCipher {
    private readonly key;
    private readonly iv;
    constructor(key: Buffer, iv: Buffer);
    static toBase64(data: string): string;
    static encodeUsername(data: string): string;
    static createKeyPair(): Promise<{
        public: string;
        private: string;
    }>;
    encrypt(data: string): string;
    decrypt(data: string): string;
}
//# sourceMappingURL=TpLinkCipher.d.ts.map