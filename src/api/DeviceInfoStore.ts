import DeviceInfo from './@types/DeviceInfo';

export const STATE_SYNC_INTERVAL_MS = 10 * 1000;
const MIN_FETCH_INTERVAL_MS = 100;

type DeviceInfoFetcher = () => Promise<DeviceInfo | null>;

export function patchFromCommand(
  command: string,
  args: unknown[]
): Partial<DeviceInfo> | undefined {
  switch (command) {
    case 'power':
      return { device_on: args[0] as boolean };
    case 'brightness':
      return { brightness: args[0] as number };
    case 'hueAndSaturation':
      return {
        hue: args[0] as number,
        saturation: args[1] as number
      };
    case 'colorTemp':
      return { color_temp: args[0] as number };
    default:
      return undefined;
  }
}

export default class DeviceInfoStore {
  private data?: DeviceInfo;
  private updatedAt = 0;
  private timer?: NodeJS.Timeout;
  private refreshInFlight?: Promise<void>;
  private fetch?: DeviceInfoFetcher;

  public seed(info: DeviceInfo): void {
    if (Object.keys(info).length === 0) {
      return;
    }

    this.data = info;
    this.updatedAt = Date.now();
  }

  public snapshot(): DeviceInfo {
    this.scheduleRefreshIfStale();
    return this.data ?? ({} as DeviceInfo);
  }

  public async refresh(fetch: DeviceInfoFetcher): Promise<DeviceInfo> {
    await this.pull(fetch);
    return this.snapshot();
  }

  public patch(partial: Partial<DeviceInfo>): void {
    if (!this.data) {
      this.data = partial as DeviceInfo;
      this.updatedAt = Date.now();
      return;
    }

    this.data = {
      ...this.data,
      ...partial
    };
    this.updatedAt = Date.now();
  }

  public startSync(fetch: DeviceInfoFetcher, intervalMs = STATE_SYNC_INTERVAL_MS): void {
    this.fetch = fetch;

    if (this.timer) {
      return;
    }

    void this.pull(fetch);
    this.timer = setInterval(() => void this.pull(fetch), intervalMs);
    this.timer.unref?.();
  }

  public stopSync(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }

    this.fetch = undefined;
    this.refreshInFlight = undefined;
  }

  private scheduleRefreshIfStale(): void {
    if (!this.fetch) {
      return;
    }

    const stale =
      !this.data || Date.now() - this.updatedAt >= STATE_SYNC_INTERVAL_MS;

    if (!stale || this.refreshInFlight) {
      return;
    }

    this.refreshInFlight = this.pull(this.fetch).finally(() => {
      this.refreshInFlight = undefined;
    });
  }

  private async pull(fetch: DeviceInfoFetcher): Promise<void> {
    if (this.data && Date.now() - this.updatedAt < MIN_FETCH_INTERVAL_MS) {
      return;
    }

    const info = await fetch();
    if (!info || Object.keys(info).length === 0) {
      return;
    }

    this.data = info;
    this.updatedAt = Date.now();
  }
}
