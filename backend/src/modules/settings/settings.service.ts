import { Prisma } from '@prisma/client';
import { prisma } from '../../core/database/prisma';

// Generic app_settings-backed configuration. Keys live in one place so callers
// don't invent strings.
const KEYS = {
  leadAutoAssign: 'leads.autoAssign',
} as const;

async function readBool(key: string, fallback: boolean): Promise<boolean> {
  const row = await prisma.appSetting.findUnique({ where: { key } });
  return typeof row?.value === 'boolean' ? row.value : fallback;
}

async function writeValue(key: string, value: Prisma.InputJsonValue): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

export const settingsService = {
  // Round-robin auto-assignment. Defaults to ON so existing behaviour is
  // unchanged until an admin turns it off.
  autoAssignEnabled(): Promise<boolean> {
    return readBool(KEYS.leadAutoAssign, true);
  },

  async setAutoAssignEnabled(enabled: boolean): Promise<boolean> {
    await writeValue(KEYS.leadAutoAssign, enabled);
    return enabled;
  },

  async getAll() {
    return { leadAutoAssign: await this.autoAssignEnabled() };
  },
};
