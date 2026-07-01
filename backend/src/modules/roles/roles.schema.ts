import { z } from 'zod';
import { PERMISSIONS } from '../../shared/constants/rbac';

export const updateRolePermissionsSchema = z.object({
  permissions: z.array(z.enum(PERMISSIONS as unknown as [string, ...string[]])).min(0),
});

export const idParamSchema = z.object({ id: z.string().uuid() });
