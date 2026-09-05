import { describe, it, expect } from 'vitest';
import { PERMISSIONS, ROLE_DEFINITIONS, ROLE_SLUGS, type PermissionSlug } from './rbac';

// The seed provisions roles from this catalog, so a typo here silently grants
// or withholds access. These checks are cheap insurance.

describe('permission catalog', () => {
  it('has no duplicates', () => {
    expect(new Set(PERMISSIONS).size).toBe(PERMISSIONS.length);
  });

  it('uses resource.action slugs throughout', () => {
    for (const slug of PERMISSIONS) {
      expect(slug).toMatch(/^[a-z_]+\.[a-z_]+$/);
    }
  });

  it('every role permission exists in the catalog', () => {
    const known = new Set<string>(PERMISSIONS);
    for (const [role, def] of Object.entries(ROLE_DEFINITIONS)) {
      if (def.permissions === '*') continue;
      for (const slug of def.permissions) {
        expect(known.has(slug), `${role} references unknown permission ${slug}`).toBe(true);
      }
    }
  });

  it('grants admin the wildcard', () => {
    expect(ROLE_DEFINITIONS[ROLE_SLUGS.ADMIN].permissions).toBe('*');
  });
});

describe('messaging permissions (stage 0)', () => {
  const messaging = PERMISSIONS.filter((p) => p.startsWith('messaging.'));

  it('adds read, write and send', () => {
    expect(messaging).toEqual(['messaging.read', 'messaging.write', 'messaging.send']);
  });

  const can = (role: keyof typeof ROLE_DEFINITIONS, slug: PermissionSlug) => {
    const perms = ROLE_DEFINITIONS[role].permissions;
    return perms === '*' || perms.includes(slug);
  };

  it('lets managers and marketing author templates', () => {
    expect(can('manager', 'messaging.write')).toBe(true);
    expect(can('marketing', 'messaging.write')).toBe(true);
  });

  // Q5 in the build plan: reps send from templates, they do not author them.
  it('lets sales send but not author', () => {
    expect(can('sales', 'messaging.read')).toBe(true);
    expect(can('sales', 'messaging.send')).toBe(true);
    expect(can('sales', 'messaging.write')).toBe(false);
  });
});
