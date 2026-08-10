import type { Prisma } from '@prisma/client';

export interface AuthContext {
  userId: string;
  officeId: string | null;
  role: string;
  permissions: string[];
}

// Row-level visibility for leads, enforced in the service/repository layer.
//  - admin / marketing: all leads (marketing is read/export only via RBAC)
//  - manager: leads in their office, plus leads with no office yet
//  - sales: only leads assigned to them
export function buildLeadScope(auth: AuthContext): Prisma.LeadWhereInput {
  const base: Prisma.LeadWhereInput = { deletedAt: null };

  switch (auth.role) {
    case 'admin':
    case 'marketing':
      return base;
    case 'manager':
      // Publicly captured leads (website / chatbot / social) have no office, so
      // an office-only filter would hide every one of them from managers.
      // Kept under AND — callers spread their own top-level OR for search, which
      // would otherwise overwrite this and leak other offices' leads.
      return auth.officeId
        ? { ...base, AND: [{ OR: [{ officeId: auth.officeId }, { officeId: null }] }] }
        : base;
    case 'sales':
      return { ...base, assignedToId: auth.userId };
    default:
      // Unknown role: most restrictive.
      return { ...base, assignedToId: auth.userId };
  }
}

export function canSeeAllOffice(role: string): boolean {
  return role === 'admin' || role === 'marketing' || role === 'manager';
}
