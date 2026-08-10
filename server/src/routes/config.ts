import { Router } from 'express';
import { getEnv } from '../lib/env.js';
import { getSearchServicesStatus } from '../lib/searchServices.js';

const router = Router();

/** Public runtime config for the SPA (no secrets). */
router.get('/', async (_req, res) => {
  const env = getEnv();
  const search = await getSearchServicesStatus();
  res.json({
    allowStaffRegistration: env.ALLOW_STAFF_REGISTRATION,
    documentSearch: search,
  });
});

export default router;
