import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import 'dotenv/config';
import {
  PERMISSIONS,
  ROLE_DEFINITIONS,
  ROLE_SLUGS,
  type RoleSlug,
} from '../src/shared/constants/rbac';

const prisma = new PrismaClient();

function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/);
  return { firstName: parts[0] ?? 'System', lastName: parts.slice(1).join(' ') || 'Admin' };
}

async function main() {
  console.log('🌱 Seeding RBAC + admin...');

  // 1. Permissions
  for (const slug of PERMISSIONS) {
    const [resource, action] = slug.split('.');
    await prisma.permission.upsert({
      where: { slug },
      update: {},
      create: { slug, resource: resource!, action: action! },
    });
  }
  const allPerms = await prisma.permission.findMany();
  const permBySlug = new Map(allPerms.map((p) => [p.slug, p.id]));

  // 2. Roles + role_permissions
  for (const slug of Object.values(ROLE_SLUGS)) {
    const def = ROLE_DEFINITIONS[slug as RoleSlug];
    const role = await prisma.role.upsert({
      where: { slug },
      update: { name: def.name, description: def.description, isSystem: true },
      create: { slug, name: def.name, description: def.description, isSystem: true },
    });

    const grantSlugs = def.permissions === '*' ? PERMISSIONS : def.permissions;
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: grantSlugs
        .map((s) => permBySlug.get(s))
        .filter((id): id is string => Boolean(id))
        .map((permissionId) => ({ roleId: role.id, permissionId })),
      skipDuplicates: true,
    });
    console.log(`  ✔ role "${slug}" (${grantSlugs.length} permissions)`);
  }

  // 3. Default office
  const office = await prisma.office.upsert({
    where: { code: 'HQ' },
    update: {},
    create: { name: 'Kratos Energy HQ', code: 'HQ', timezone: 'Australia/Sydney' },
  });

  // 4. Seed admin
  const adminRole = await prisma.role.findUniqueOrThrow({ where: { slug: ROLE_SLUGS.ADMIN } });
  const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@kratosenergy.com.au').toLowerCase();
  const { firstName, lastName } = splitName(process.env.SEED_ADMIN_NAME ?? 'System Admin');
  const passwordHash = await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD ?? 'Admin@12345', 12);

  await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      firstName,
      lastName,
      passwordHash,
      roleId: adminRole.id,
      officeId: office.id,
      isActive: true,
      emailVerifiedAt: new Date(),
    },
  });
  console.log(`  ✔ admin user "${email}"`);

  // 5. Lead sources (Phase 2)
  const sources: { name: string; slug: string; type: string }[] = [
    { name: 'Website', slug: 'website', type: 'website' },
    { name: 'Landing Page', slug: 'landing-page', type: 'website' },
    { name: 'Facebook', slug: 'facebook', type: 'social' },
    { name: 'Instagram', slug: 'instagram', type: 'social' },
    { name: 'TikTok', slug: 'tiktok', type: 'social' },
    { name: 'Google Ads', slug: 'google-ads', type: 'social' },
    { name: 'Chatbot', slug: 'chatbot', type: 'chatbot' },
    { name: 'Referral', slug: 'referral', type: 'referral' },
    { name: 'Manual Entry', slug: 'manual', type: 'manual' },
  ];
  for (const s of sources) {
    await prisma.leadSource.upsert({ where: { slug: s.slug }, update: { name: s.name, type: s.type }, create: s });
  }
  console.log(`  ✔ ${sources.length} lead sources`);

  // 6. Pipeline stages — LEAD track (Phase 2). DEAL track added in Phase 4.
  const stages: {
    name: string;
    slug: string;
    order: number;
    color: string;
    isDefault?: boolean;
    isLost?: boolean;
  }[] = [
    { name: 'New', slug: 'new', order: 1, color: '#3b82f6', isDefault: true },
    { name: 'Contacted', slug: 'contacted', order: 2, color: '#8b5cf6' },
    { name: 'Qualified', slug: 'qualified', order: 3, color: '#10b981' },
    { name: 'Unqualified', slug: 'unqualified', order: 4, color: '#94a3b8', isLost: true },
  ];
  for (const st of stages) {
    await prisma.pipelineStage.upsert({
      where: { slug: st.slug },
      update: { name: st.name, order: st.order, color: st.color, isDefault: st.isDefault ?? false, isLost: st.isLost ?? false },
      create: { name: st.name, slug: st.slug, order: st.order, color: st.color, track: 'LEAD', isDefault: st.isDefault ?? false, isLost: st.isLost ?? false },
    });
  }
  console.log(`  ✔ ${stages.length} pipeline stages`);

  console.log('✅ Seed complete');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
