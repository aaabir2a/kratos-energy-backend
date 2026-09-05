import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ROLE_DEFINITIONS, PERMISSIONS, type PermissionSlug } from '../../shared/constants/rbac';
import { AppError } from '../../shared/errors/AppError';
// vi.mock is hoisted above these imports, so the router below is wired to the
// stubbed auth middleware and the mocked service.
import { messagingRouter } from './messaging.routes';
import { errorHandler } from '../../core/middlewares/error.middleware';

// The real authenticate() verifies a JWT. These tests are about what happens
// *after* that — the permission gates and validation — so authenticate is
// replaced with a stub that injects whichever role we are testing. Everything
// else in the chain (requirePermission, validate, the routes) is the real code.
let actingAs: { role: string; permissions: string[] } | null = null;

vi.mock('../../core/middlewares/auth.middleware', () => ({
  authenticate: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    if (!actingAs) {
      // Same error the real middleware raises for a missing Bearer token.
      next(AppError.unauthorized());
      return;
    }
    req.auth = {
      userId: '00000000-0000-4000-8000-000000000001',
      officeId: null,
      role: actingAs.role,
      permissions: actingAs.permissions,
    } as never;
    next();
  },
}));

// The service is mocked out: these tests must fail on a broken guard, not on a
// missing database. Any call that reaches it means the gate let the request
// through, which is exactly what we are asserting.
const listTemplates = vi.fn().mockResolvedValue({ items: [], total: 0 });
const createTemplate = vi.fn().mockResolvedValue({ id: 'new-template' });
vi.mock('./messaging.service', () => ({
  messagingService: {
    mergeFields: () => [{ field: 'firstName', label: 'First name', fallback: 'there' }],
    listTemplates: (...args: unknown[]) => listTemplates(...args),
    createTemplate: (...args: unknown[]) => createTemplate(...args),
    getTemplate: vi.fn(),
    updateTemplate: vi.fn(),
    deleteTemplate: vi.fn(),
    previewTemplate: vi.fn(),
  },
}));

const app = express();
app.use(express.json());
app.use('/messaging', messagingRouter);
app.use(errorHandler);

/** Sign in as a role using the permission set the seed actually provisions. */
function as(role: keyof typeof ROLE_DEFINITIONS) {
  const def = ROLE_DEFINITIONS[role];
  actingAs = {
    role,
    permissions: def.permissions === '*' ? ['*.*'] : [...def.permissions],
  };
}

beforeEach(() => {
  actingAs = null;
  listTemplates.mockClear();
  createTemplate.mockClear();
});

describe('authentication', () => {
  it('rejects an unauthenticated request', async () => {
    const res = await request(app).get('/messaging/templates');
    expect(res.status).toBe(401);
  });
});

describe('permission gates', () => {
  it('lets an admin list templates', async () => {
    as('admin');
    const res = await request(app).get('/messaging/templates');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('lets marketing create a template', async () => {
    as('marketing');
    const res = await request(app)
      .post('/messaging/templates')
      .send({ name: 'Referral offer', bodyHtml: '<p>Hi {{firstName}}</p>' });
    expect(res.status).toBe(201);
    expect(createTemplate).toHaveBeenCalled();
  });

  // The Q5 rule from the build plan, enforced rather than documented.
  it('stops a sales rep authoring a template', async () => {
    as('sales');
    const res = await request(app)
      .post('/messaging/templates')
      .send({ name: 'Mine', bodyHtml: '<p>x</p>' });
    expect(res.status).toBe(403);
    expect(createTemplate).not.toHaveBeenCalled();
  });

  it('still lets a sales rep read templates and merge fields', async () => {
    as('sales');
    expect((await request(app).get('/messaging/templates')).status).toBe(200);
    expect((await request(app).get('/messaging/merge-fields')).status).toBe(200);
  });

  it('stops a role with no messaging permissions at all', async () => {
    actingAs = { role: 'nobody', permissions: ['leads.read'] };
    expect((await request(app).get('/messaging/templates')).status).toBe(403);
    expect((await request(app).get('/messaging/merge-fields')).status).toBe(403);
  });

  it('refuses to archive a template without write permission', async () => {
    as('sales');
    const res = await request(app).delete('/messaging/templates/11111111-1111-4111-8111-111111111111');
    expect(res.status).toBe(403);
  });
});

describe('validation', () => {
  // This API answers validation failures with 422 (VALIDATION_ERROR), not 400.
  it('rejects a body with no content, after the permission check passes', async () => {
    as('marketing');
    const res = await request(app).post('/messaging/templates').send({ name: 'x', bodyHtml: '' });
    expect(res.status).toBe(422);
    expect(createTemplate).not.toHaveBeenCalled();
  });

  it('rejects an id that is not a uuid', async () => {
    as('admin');
    const res = await request(app).get('/messaging/templates/not-a-uuid');
    expect(res.status).toBe(422);
  });

  it('caps the page size at 100 rather than trusting the query string', async () => {
    as('admin');
    await request(app).get('/messaging/templates?limit=5000');
    expect(listTemplates).toHaveBeenCalledWith(expect.objectContaining({ limit: 100 }));
  });
});

describe('permission slugs used by the routes', () => {
  it('every slug the router guards on exists in the catalog', () => {
    const known = new Set<PermissionSlug>(PERMISSIONS);
    for (const slug of ['messaging.read', 'messaging.write', 'messaging.send'] as PermissionSlug[]) {
      expect(known.has(slug)).toBe(true);
    }
  });
});
