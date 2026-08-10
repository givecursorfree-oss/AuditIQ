import { Router } from 'express';
import { authenticate, requireStaff } from './auth.js';
import { enforceHierarchyScope } from './hierarchyScope.js';

/** Mount a staff-only API router (blocks Client role; requires valid session). */
export function staffApi(router: Router): Router {
  const wrapped = Router();
  wrapped.use(authenticate);
  wrapped.use(requireStaff);
  wrapped.use(enforceHierarchyScope);
  wrapped.use(router);
  return wrapped;
}
