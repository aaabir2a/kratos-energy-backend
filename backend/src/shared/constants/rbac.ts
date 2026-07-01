// Central RBAC catalog. Seed reads this to provision roles + permissions.
// Matches architecture_design.md §9 (4 roles) and Appendix C access resolution.

export const PERMISSIONS = [
  // platform
  'users.read', 'users.write', 'users.delete',
  'roles.read', 'roles.write',
  'offices.read', 'offices.write',
  'settings.read', 'settings.write',
  'audit.read',
  // leads (Phase 2)
  'leads.read', 'leads.write', 'leads.delete', 'leads.assign', 'leads.export', 'leads.convert',
  // pipeline / activities (Phase 2)
  'pipeline.read', 'pipeline.write',
  'activities.read', 'activities.write',
  // deals (Phase 4)
  'deals.read', 'deals.write', 'deals.close', 'deals.approve',
  // marketing (Phase 5)
  'landing_pages.read', 'landing_pages.write',
  'forms.read', 'forms.write',
  'campaigns.read', 'campaigns.write',
  'sources.read',
  // catalog (Phase 6)
  'catalog.read', 'catalog.write',
  // analytics (Phase 8)
  'analytics.read',
] as const;

export type PermissionSlug = (typeof PERMISSIONS)[number];

export const ROLE_SLUGS = {
  ADMIN: 'admin',
  MANAGER: 'manager',
  MARKETING: 'marketing',
  SALES: 'sales',
} as const;

export type RoleSlug = (typeof ROLE_SLUGS)[keyof typeof ROLE_SLUGS];

// Admin gets the wildcard at runtime (see rbac.middleware). Stored explicitly too.
export const ROLE_DEFINITIONS: Record<
  RoleSlug,
  { name: string; description: string; permissions: PermissionSlug[] | '*' }
> = {
  admin: {
    name: 'Administrator',
    description: 'Full system access',
    permissions: '*',
  },
  manager: {
    name: 'Sales Manager',
    description: 'Oversees leads and deals across the office; can assign and approve',
    permissions: [
      'users.read', 'offices.read', 'audit.read',
      'leads.read', 'leads.write', 'leads.assign', 'leads.export', 'leads.convert', 'leads.delete',
      'pipeline.read', 'pipeline.write', 'activities.read', 'activities.write',
      'deals.read', 'deals.write', 'deals.close', 'deals.approve',
      'catalog.read', 'sources.read', 'analytics.read',
    ],
  },
  marketing: {
    name: 'Marketing',
    description: 'Builds landing pages and forms; reads and exports leads',
    permissions: [
      'landing_pages.read', 'landing_pages.write',
      'forms.read', 'forms.write',
      'campaigns.read', 'campaigns.write',
      'sources.read', 'catalog.read',
      'leads.read', 'leads.export',
      'analytics.read',
    ],
  },
  sales: {
    name: 'Sales Representative',
    description: 'Works assigned leads and own deals through to close',
    permissions: [
      'leads.read', 'leads.write', 'leads.convert',
      'pipeline.read', 'activities.read', 'activities.write',
      'deals.read', 'deals.write', 'deals.close',
      'catalog.read',
    ],
  },
};
