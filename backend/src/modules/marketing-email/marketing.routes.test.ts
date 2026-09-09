import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ROLE_DEFINITIONS, PERMISSIONS, type PermissionSlug, type RoleSlug } from '../../shared/constants/rbac';
import { AppError } from '../../shared/errors/AppError';
// vi.mock is hoisted above these imports, so the router below is wired to the
// stubbed auth middleware and the mocked services.
import { marketingEmailRouter } from './marketing.routes';
import { errorHandler } from '../../core/middlewares/error.middleware';

// Same shape as the messaging route tests: the real authenticate() verifies a
// JWT, and these tests are about what happens after that.
let actingAs: { role: string; permissions: string[] } | null = null;

vi.mock('../../core/middlewares/auth.middleware', () => ({
  authenticate: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    if (!actingAs) {
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

// Services are mocked: a failure here must mean a broken guard, not a missing
// database. Any call that lands means the gate let the request through.
const listLists = vi.fn().mockResolvedValue({ items: [], total: 0 });
const createList = vi.fn().mockResolvedValue({ id: 'new-list' });
vi.mock('./contacts.service', () => ({
  contactsService: {
    listLists: (...args: unknown[]) => listLists(...args),
    createList: (...args: unknown[]) => createList(...args),
    getList: vi.fn(),
    updateList: vi.fn(),
    deleteList: vi.fn(),
    listHealth: vi.fn(),
    addToLists: vi.fn(),
    removeFromList: vi.fn(),
    listContacts: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    getContact: vi.fn(),
    upsertContact: vi.fn(),
    updateContact: vi.fn(),
    deleteContact: vi.fn(),
  },
}));

vi.mock('./import.service', () => ({
  importService: { preview: vi.fn(), import: vi.fn() },
}));

const listCampaigns = vi.fn().mockResolvedValue({ items: [], total: 0 });
const createCampaign = vi.fn().mockResolvedValue({ id: 'new-campaign' });
const sendCampaign = vi.fn().mockResolvedValue({ queued: 3, scheduledFor: null });
const cancelCampaign = vi.fn().mockResolvedValue({ cancelled: 2 });
vi.mock('./campaign.service', () => ({
  campaignService: {
    list: (...args: unknown[]) => listCampaigns(...args),
    create: (...args: unknown[]) => createCampaign(...args),
    get: vi.fn(),
    preview: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    send: (...args: unknown[]) => sendCampaign(...args),
    cancel: (...args: unknown[]) => cancelCampaign(...args),
  },
}));

// Audit writes to the database and is best-effort in production; here it would
// reach for a real connection, so it is stubbed out.
vi.mock('../../shared/utils/audit', () => ({ audit: vi.fn().mockResolvedValue(undefined) }));

const app = express();
app.use(express.json());
app.use('/marketing-email', marketingEmailRouter);
app.use(errorHandler);

const CAMPAIGN_ID = '11111111-1111-4111-8111-111111111111';

/** Sign in as a seeded role, with exactly the permissions the seed provisions. */
function as(role: RoleSlug) {
  const def = ROLE_DEFINITIONS[role];
  actingAs = { role, permissions: def.permissions === '*' ? ['*.*'] : [...def.permissions] };
}

beforeEach(() => {
  actingAs = null;
  vi.clearAllMocks();
  listLists.mockResolvedValue({ items: [], total: 0 });
  listCampaigns.mockResolvedValue({ items: [], total: 0 });
  createList.mockResolvedValue({ id: 'new-list' });
  createCampaign.mockResolvedValue({ id: 'new-campaign' });
  sendCampaign.mockResolvedValue({ queued: 3, scheduledFor: null });
  cancelCampaign.mockResolvedValue({ cancelled: 2 });
});

describe('authentication', () => {
  it('rejects an unauthenticated request', async () => {
    expect((await request(app).get('/marketing-email/lists')).status).toBe(401);
    expect((await request(app).get('/marketing-email/campaigns')).status).toBe(401);
  });
});

describe('admin-only by default', () => {
  it('lets an admin read, write and send', async () => {
    as('admin');
    expect((await request(app).get('/marketing-email/lists')).status).toBe(200);
    expect((await request(app).get('/marketing-email/campaigns')).status).toBe(200);
    expect((await request(app).post('/marketing-email/campaigns').send({ name: 'October news' })).status).toBe(201);
    expect((await request(app).post(`/marketing-email/campaigns/${CAMPAIGN_ID}/send`).send({})).status).toBe(200);
  });

  // The decision recorded in the plan: email marketing is admin-only until an
  // admin widens it, so the other seeded roles must not see it.
  it.each(['manager', 'marketing', 'sales'] as const)('keeps %s out entirely', async (role) => {
    as(role);
    expect((await request(app).get('/marketing-email/lists')).status).toBe(403);
    expect((await request(app).get('/marketing-email/contacts')).status).toBe(403);
    expect((await request(app).get('/marketing-email/campaigns')).status).toBe(403);
    expect(listLists).not.toHaveBeenCalled();
    expect(listCampaigns).not.toHaveBeenCalled();
  });

  it('is not opened up by holding the older campaigns permission', async () => {
    // `campaigns.*` predates this module and means landing-page campaigns.
    actingAs = { role: 'marketing', permissions: ['campaigns.read', 'campaigns.write', 'messaging.send'] };
    expect((await request(app).get('/marketing-email/campaigns')).status).toBe(403);
  });
});

describe('a role an admin has widened', () => {
  it('reads with marketing_email.read but cannot create', async () => {
    actingAs = { role: 'assistant', permissions: ['marketing_email.read'] };
    expect((await request(app).get('/marketing-email/campaigns')).status).toBe(200);
    expect((await request(app).post('/marketing-email/lists').send({ name: 'Past customers' })).status).toBe(403);
    expect(createList).not.toHaveBeenCalled();
  });

  // Sending is its own permission precisely so someone can build a campaign
  // without being able to fire it at a few thousand people.
  it('builds with write but cannot send or stop', async () => {
    actingAs = { role: 'assistant', permissions: ['marketing_email.read', 'marketing_email.write'] };
    expect((await request(app).post('/marketing-email/campaigns').send({ name: 'Draft' })).status).toBe(201);
    expect((await request(app).post(`/marketing-email/campaigns/${CAMPAIGN_ID}/send`).send({})).status).toBe(403);
    expect((await request(app).post(`/marketing-email/campaigns/${CAMPAIGN_ID}/cancel`)).status).toBe(403);
    expect(sendCampaign).not.toHaveBeenCalled();
    expect(cancelCampaign).not.toHaveBeenCalled();
  });

  it('sends with marketing_email.send', async () => {
    actingAs = {
      role: 'assistant',
      permissions: ['marketing_email.read', 'marketing_email.write', 'marketing_email.send'],
    };
    const res = await request(app).post(`/marketing-email/campaigns/${CAMPAIGN_ID}/send`).send({});
    expect(res.status).toBe(200);
    expect(res.body.data.queued).toBe(3);
  });
});

describe('validation', () => {
  // This API answers validation failures with 422 (VALIDATION_ERROR), not 400.
  it('rejects a campaign with no name', async () => {
    as('admin');
    expect((await request(app).post('/marketing-email/campaigns').send({ name: '' })).status).toBe(422);
    expect(createCampaign).not.toHaveBeenCalled();
  });

  it('rejects an id that is not a uuid', async () => {
    as('admin');
    expect((await request(app).get('/marketing-email/campaigns/not-a-uuid')).status).toBe(422);
  });

  it('rejects a status filter outside the enum', async () => {
    as('admin');
    expect((await request(app).get('/marketing-email/campaigns?status=EXPLODED')).status).toBe(422);
  });

  it('rejects a send time that is not a timestamp', async () => {
    as('admin');
    const res = await request(app)
      .post(`/marketing-email/campaigns/${CAMPAIGN_ID}/send`)
      .send({ scheduledFor: 'next tuesday' });
    expect(res.status).toBe(422);
    expect(sendCampaign).not.toHaveBeenCalled();
  });

  it('caps the page size at 100 rather than trusting the query string', async () => {
    as('admin');
    await request(app).get('/marketing-email/campaigns?limit=5000');
    expect(listCampaigns).toHaveBeenCalledWith(expect.objectContaining({ limit: 100 }));
  });
});

describe('the permission catalogue', () => {
  it('contains every slug the router guards on', () => {
    const known = new Set<PermissionSlug>(PERMISSIONS);
    for (const slug of [
      'marketing_email.read',
      'marketing_email.write',
      'marketing_email.send',
    ] as PermissionSlug[]) {
      expect(known.has(slug)).toBe(true);
    }
  });

  it('grants them to admin alone in the seeded roles', () => {
    for (const [role, def] of Object.entries(ROLE_DEFINITIONS)) {
      if (role === 'admin') {
        expect(def.permissions).toBe('*');
        continue;
      }
      const perms = def.permissions === '*' ? [] : def.permissions;
      expect(perms.filter((p) => p.startsWith('marketing_email.'))).toEqual([]);
    }
  });
});
