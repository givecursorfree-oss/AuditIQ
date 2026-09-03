/** Client mirrors of server session policy (idle UI). */
export const SESSION_IDLE_MS = 30 * 60 * 1000;
export const SESSION_IDLE_WARN_MS = 2 * 60 * 1000;
export const SESSION_ABSOLUTE_MS = 12 * 60 * 60 * 1000;

export const SESSION_WARN_AT_MS = SESSION_IDLE_MS - SESSION_IDLE_WARN_MS;
