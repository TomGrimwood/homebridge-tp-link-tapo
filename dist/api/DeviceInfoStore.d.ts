import DeviceInfo from './@types/DeviceInfo';
export declare const STATE_SYNC_INTERVAL_MS: number;
type DeviceInfoFetcher = () => Promise<DeviceInfo | null>;
export declare function patchFromCommand(command: string, args: unknown[]): Partial<DeviceInfo> | undefined;
export default class DeviceInfoStore {
    private data?;
    private updatedAt;
    private timer?;
    private refreshInFlight?;
    private fetch?;
    seed(info: DeviceInfo): void;
    snapshot(): DeviceInfo;
    refresh(fetch: DeviceInfoFetcher): Promise<DeviceInfo>;
    patch(partial: Partial<DeviceInfo>): void;
    startSync(fetch: DeviceInfoFetcher, intervalMs?: number): void;
    stopSync(): void;
    private scheduleRefreshIfStale;
    private pull;
}
export {};
//# sourceMappingURL=DeviceInfoStore.d.ts.map