import { Router } from 'express';
import { authRouter } from './modules/auth/auth.routes';
import { usersRouter } from './modules/users/users.routes';
import { rolesRouter } from './modules/roles/roles.routes';
import { officesRouter } from './modules/offices/offices.routes';
import { leadsRouter } from './modules/leads/leads.routes';
import { pipelineRouter } from './modules/pipeline/pipeline.routes';
import { sourcesRouter, campaignsRouter } from './modules/sources/sources.routes';
import { intakeRouter } from './modules/intake/intake.routes';
import { dealsRouter, convertHandler } from './modules/deals/deals.routes';
import { landingPagesRouter, formsRouter, publicPagesRouter } from './modules/marketing/marketing.routes';
import { productsRouter, packagesRouter, publicCatalogRouter } from './modules/catalog/catalog.routes';

export const apiRouter = Router();

apiRouter.get('/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok', ts: new Date().toISOString() } });
});

apiRouter.use('/auth', authRouter);
apiRouter.use('/users', usersRouter);
apiRouter.use('/roles', rolesRouter);
apiRouter.use('/offices', officesRouter);
// Public intake — mounted BEFORE the authenticated leads router so
// POST /leads/submit resolves without auth.
apiRouter.use('/intake', intakeRouter);
apiRouter.post('/leads/submit', (req, res, next) => {
  req.url = '/submit';
  intakeRouter(req, res, next);
});

// Lead → Deal conversion (must precede the generic /leads router mount).
apiRouter.post('/leads/:id/convert', ...convertHandler);

apiRouter.use('/leads', leadsRouter);
apiRouter.use('/pipeline', pipelineRouter);
apiRouter.use('/sources', sourcesRouter);
apiRouter.use('/campaigns', campaignsRouter);
apiRouter.use('/deals', dealsRouter);
apiRouter.use('/landing-pages', landingPagesRouter);
apiRouter.use('/forms', formsRouter);
apiRouter.use('/p', publicPagesRouter); // public page delivery, no auth
apiRouter.use('/products', productsRouter);
apiRouter.use('/packages', packagesRouter);
apiRouter.use('/public', publicCatalogRouter); // public catalog for the main website, no auth
