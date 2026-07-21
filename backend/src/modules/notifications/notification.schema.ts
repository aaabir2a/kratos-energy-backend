import { z } from 'zod';

export const idParamSchema = z.object({ id: z.string().uuid() });

export const settingsSchema = z.object({
  adminEmails: z.array(z.string().email()).max(20),
});

export type SettingsInput = z.infer<typeof settingsSchema>;
