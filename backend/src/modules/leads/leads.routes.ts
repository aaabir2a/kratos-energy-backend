import { Router } from 'express';
import multer from 'multer';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { validate } from '../../core/middlewares/validate.middleware';
import { authenticate } from '../../core/middlewares/auth.middleware';
import { requirePermission } from '../../core/middlewares/rbac.middleware';
import { leadsController } from './leads.controller';
import {
  createLeadSchema,
  updateLeadSchema,
  assignSchema,
  moveStageSchema,
  lostSchema,
  addNoteSchema,
  addActivitySchema,
  idParamSchema,
} from './leads.schema';

// CSV uploads only — kept small since the row cap is a few thousand leads.
const csvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

export const leadsRouter = Router();

leadsRouter.use(authenticate);

leadsRouter.get('/', requirePermission('leads.read'), asyncHandler(leadsController.list));
leadsRouter.get('/stats', requirePermission('leads.read'), asyncHandler(leadsController.stats));
// Declared before /:id so these aren't captured as lead ids.
leadsRouter.get('/export', requirePermission('leads.export'), asyncHandler(leadsController.exportCsv));
leadsRouter.get('/import/spec', requirePermission('leads.write'), leadsController.importSpec);
leadsRouter.get('/import/template', requirePermission('leads.write'), leadsController.importTemplate);
leadsRouter.post('/import/validate', requirePermission('leads.write'), csvUpload.single('file'), asyncHandler(leadsController.importValidate));
leadsRouter.post('/import', requirePermission('leads.write'), csvUpload.single('file'), asyncHandler(leadsController.importCommit));
leadsRouter.post('/', requirePermission('leads.write'), validate({ body: createLeadSchema }), asyncHandler(leadsController.create));

leadsRouter.get('/:id', requirePermission('leads.read'), validate({ params: idParamSchema }), asyncHandler(leadsController.get));
leadsRouter.patch('/:id', requirePermission('leads.write'), validate({ params: idParamSchema, body: updateLeadSchema }), asyncHandler(leadsController.update));
leadsRouter.delete('/:id', requirePermission('leads.delete'), validate({ params: idParamSchema }), asyncHandler(leadsController.remove));

leadsRouter.patch('/:id/assign', requirePermission('leads.assign'), validate({ params: idParamSchema, body: assignSchema }), asyncHandler(leadsController.assign));
leadsRouter.patch('/:id/stage', requirePermission('leads.write'), validate({ params: idParamSchema, body: moveStageSchema }), asyncHandler(leadsController.moveStage));
leadsRouter.patch('/:id/lost', requirePermission('leads.write'), validate({ params: idParamSchema, body: lostSchema }), asyncHandler(leadsController.markLost));

leadsRouter.get('/:id/notes', requirePermission('leads.read'), validate({ params: idParamSchema }), asyncHandler(leadsController.listNotes));
leadsRouter.post('/:id/notes', requirePermission('activities.write'), validate({ params: idParamSchema, body: addNoteSchema }), asyncHandler(leadsController.addNote));

leadsRouter.get('/:id/activities', requirePermission('leads.read'), validate({ params: idParamSchema }), asyncHandler(leadsController.listActivities));
leadsRouter.get('/:id/attributions', requirePermission('leads.read'), validate({ params: idParamSchema }), asyncHandler(leadsController.listAttributions));
leadsRouter.post('/:id/activities', requirePermission('activities.write'), validate({ params: idParamSchema, body: addActivitySchema }), asyncHandler(leadsController.addActivity));
