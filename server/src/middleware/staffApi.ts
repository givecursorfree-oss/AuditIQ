import { Router } from 'express';
import { authenticate, requireStaff } from './auth.js';
import { enforceHierarchyScope } from './hierarchyScope.js';

/** Mount a staff-only API router (blocks Client role; requires valid session). */
export function staffApi(router: Router): Router {
  // mergeParams: parent mount params (e.g. /engagements/:id/drive-folders) must reach nested routers
  const wrapped = Router({ mergeParams: true });
  wrapped.use(authenticate);
  wrapped.use(requireStaff);
  wrapped.use(enforceHierarchyScope);
  wrapped.use(router);
  return wrapped;
}
