import { prisma } from '../../core/database/prisma';
import { ROLE_SLUGS } from '../../shared/constants/rbac';

// Round-robin (load-balanced) auto-assignment: pick the active sales rep with the
// fewest currently-open assigned leads. Scoped to the lead's office when set.
export async function pickRoundRobinAssignee(officeId: string | null): Promise<string | null> {
  const reps = await prisma.user.findMany({
    where: {
      deletedAt: null,
      isActive: true,
      role: { slug: ROLE_SLUGS.SALES },
      ...(officeId ? { officeId } : {}),
    },
    select: { id: true },
  });

  // Fall back to any-office sales reps if none in the lead's office.
  let pool = reps;
  if (!pool.length && officeId) {
    pool = await prisma.user.findMany({
      where: { deletedAt: null, isActive: true, role: { slug: ROLE_SLUGS.SALES } },
      select: { id: true },
    });
  }
  if (!pool.length) return null;

  const counts = await prisma.lead.groupBy({
    by: ['assignedToId'],
    where: {
      assignedToId: { in: pool.map((r) => r.id) },
      status: 'OPEN',
      deletedAt: null,
    },
    _count: { _all: true },
  });
  const countMap = new Map(counts.map((c) => [c.assignedToId, c._count._all]));

  // Lowest open-lead count wins; ties broken by pool order (stable).
  let best = pool[0].id;
  let bestCount = countMap.get(best) ?? 0;
  for (const rep of pool) {
    const c = countMap.get(rep.id) ?? 0;
    if (c < bestCount) {
      best = rep.id;
      bestCount = c;
    }
  }
  return best;
}
