import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requireClientPortalClient } from './shared.js';
import clientPortalRequestsRoutes from './requests.routes.js';
import clientPortalLettersRoutes from './letters.routes.js';
import clientPortalProfileRoutes from './profile.routes.js';
import clientPortalEngagementsRoutes from './engagements.routes.js';
import clientPortalDocumentsRoutes from './documents.routes.js';
import clientPortalDocumentRequestsRoutes from './document-requests.routes.js';
import clientPortalLegacyRoutes from './legacy.routes.js';
import clientPortalBillingRoutes from './billing.routes.js';
import clientPortalReportsRoutes from './reports.routes.js';
import clientPortalAuditQueriesRoutes from './audit-queries.routes.js';

const router = Router();

router.use(authenticate);
router.use(requireClientPortalClient);

router.use(clientPortalRequestsRoutes);
router.use(clientPortalLettersRoutes);
router.use(clientPortalProfileRoutes);
router.use(clientPortalEngagementsRoutes);
router.use(clientPortalDocumentsRoutes);
router.use(clientPortalDocumentRequestsRoutes);
router.use(clientPortalLegacyRoutes);
router.use(clientPortalBillingRoutes);
router.use(clientPortalReportsRoutes);
router.use(clientPortalAuditQueriesRoutes);

export default router;
