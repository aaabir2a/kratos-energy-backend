import { Prisma } from '@prisma/client';
import { prisma } from '../../core/database/prisma';
import { DEFAULT_WINDOW, type SendingWindow } from './timing';

// Sending rules live in app_settings, the same JSON key/value table the
// notification recipients and auto-assign toggle use.

const KEYS = {
  paused: 'messaging.sendingPaused',
  window: 'messaging.sendingWindow',
  throttle: 'messaging.throttlePerHour',
} as const;

export interface MessagingSettings {
  /** Global kill switch. Nothing is claimed while this is on. */
  sendingPaused: boolean;
  sendingWindow: SendingWindow;
  /** Ceiling on messages sent per rolling hour, protecting sender reputation. */
  throttlePerHour: number;
}

export const DEFAULT_SETTINGS: MessagingSettings = {
  sendingPaused: false,
  sendingWindow: DEFAULT_WINDOW,
  throttlePerHour: 200,
};

async function read<T>(key: string, fallback: T): Promise<T> {
  const row = await prisma.appSetting.findUnique({ where: { key } });
  return row === null || row.value === null ? fallback : (row.value as T);
}

async function write(key: string, value: Prisma.InputJsonValue): Promise<void> {
  await prisma.appSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
}

export const messagingSettings = {
  async getAll(): Promise<MessagingSettings> {
    const [sendingPaused, sendingWindow, throttlePerHour] = await Promise.all([
      read<boolean>(KEYS.paused, DEFAULT_SETTINGS.sendingPaused),
      read<SendingWindow>(KEYS.window, DEFAULT_SETTINGS.sendingWindow),
      read<number>(KEYS.throttle, DEFAULT_SETTINGS.throttlePerHour),
    ]);
    // A partially written window (an older key, a hand-edited row) must not
    // leave a field undefined — that would read as "no quiet hours".
    return {
      sendingPaused,
      sendingWindow: { ...DEFAULT_SETTINGS.sendingWindow, ...sendingWindow },
      throttlePerHour,
    };
  },

  async isPaused(): Promise<boolean> {
    return read<boolean>(KEYS.paused, DEFAULT_SETTINGS.sendingPaused);
  },

  async setPaused(paused: boolean): Promise<boolean> {
    await write(KEYS.paused, paused);
    return paused;
  },

  async setWindow(window: SendingWindow): Promise<SendingWindow> {
    await write(KEYS.window, window as unknown as Prisma.InputJsonValue);
    return window;
  },

  async setThrottle(perHour: number): Promise<number> {
    await write(KEYS.throttle, perHour);
    return perHour;
  },

  /**
   * The window for a lead's office, falling back to the global setting.
   * A Perth office sends in Perth's morning, not Sydney's.
   */
  async windowForOffice(officeId: string | null | undefined): Promise<SendingWindow> {
    const settings = await this.getAll();
    if (!officeId) return settings.sendingWindow;
    const office = await prisma.office.findUnique({ where: { id: officeId }, select: { timezone: true } });
    return office?.timezone ? { ...settings.sendingWindow, timezone: office.timezone } : settings.sendingWindow;
  },
};
