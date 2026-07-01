import { Router } from 'express';
import { authRouter } from './modules/auth/auth.routes';
import { usersRouter } from './modules/users/users.routes';
import { rolesRouter } from './modules/roles/roles.routes';
import { officesRouter } from './modules/offices/offices.routes';
import { leadsRouter } from './modules/leads/leads.routes';
import { pipelineRouter } from './modules/pipeline/pipeline.routes';
import { sourcesRouter } from './modules/sources/sources.routes';

export const apiRouter = Router();

apiRouter.get('/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok', ts: new Date().toISOString() } });
});

apiRouter.use('/auth', authRouter);
apiRouter.use('/users', usersRouter);
apiRouter.use('/roles', rolesRouter);
apiRouter.use('/offices', officesRouter);
apiRouter.use('/leads', leadsRouter);
apiRouter.use('/pipeline', pipelineRouter);
apiRouter.use('/sources', sourcesRouter);
