import axios from 'axios';
import { clearStoredUser } from '@/lib/userStorage';
import { looksLikeSpaHtml, resolveApiBaseUrl } from '@/lib/apiBase';

const api = axios.create({
  baseURL: resolveApiBaseUrl(),
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true, // Send httpOnly cookies with every request
  timeout: 25_000, // Fail fast when API/nginx is down instead of hanging ~60s
});

// Let the browser set multipart boundary — default application/json breaks file uploads
api.interceptors.request.use((config) => {
  if (config.data instanceof FormData && config.headers) {
    const headers = config.headers as Record<string, unknown> & {
      delete?: (key: string) => void;
    };
    if (typeof headers.delete === 'function') {
      headers.delete('Content-Type');
    } else {
      delete headers['Content-Type'];
    }
  }
  return config;
});

// Vercel SPA rewrite returns index.html for /api/* when VITE_API_URL is missing.
api.interceptors.response.use((response) => {
  const ct = String(response.headers?.['content-type'] || '');
  if (ct.includes('text/html') || looksLikeSpaHtml(response.data)) {
    return Promise.reject(
      new Error(
        'API returned HTML instead of JSON. Set VITE_API_URL to your VPS API (e.g. https://api.mkdandeker.com) and redeploy.'
      )
    );
  }
  return response;
});

let isRefreshing = false;
let refreshPromise: Promise<void> | null = null;
let failedQueue: Array<{ resolve: (value?: unknown) => void; reject: (reason?: any) => void }> = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

async function refreshSession(): Promise<void> {
  if (refreshPromise) return refreshPromise;
  isRefreshing = true;
  refreshPromise = api
    .post('/auth/refresh', {})
    .then(() => {
      processQueue(null, 'refreshed');
    })
    .catch((refreshError) => {
      processQueue(refreshError, null);
      const status = (refreshError as { response?: { status?: number; data?: { code?: string } } })?.response
        ?.status;
      const code = (refreshError as { response?: { data?: { code?: string } } })?.response?.data?.code;
      // ponytail: 429 = rate limited, not logged out — avoid redirect loops to /login
      if (status !== 429) {
        clearStoredUser();
        const reason = code === 'SESSION_ABSOLUTE' ? 'absolute' : 'expired';
        window.location.href = `/login?session=${reason}`;
      }
      throw refreshError;
    })
    .finally(() => {
      isRefreshing = false;
      refreshPromise = null;
    });
  return refreshPromise;
}

// Handle 401 responses globally
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const url = originalRequest?.url || '';
    const isAuthEndpoint =
      url.includes('/auth/login') ||
      url.includes('/auth/register') ||
      url.includes('/auth/register-client') ||
      url.includes('/auth/me') ||
      url.includes('/auth/logout') ||
      url.includes('/auth/refresh');

    if (error.response?.status === 401 && !isAuthEndpoint && !originalRequest._retry) {
      originalRequest._retry = true;

      if (isRefreshing) {
        return new Promise(function (resolve, reject) {
          failedQueue.push({ resolve, reject });
        })
          .then(() => api(originalRequest))
          .catch((err) => Promise.reject(err));
      }

      try {
        await refreshSession();
        return api(originalRequest);
      } catch (refreshError) {
        return Promise.reject(refreshError);
      }
    }

    if (error.response?.status === 401 && !isAuthEndpoint && originalRequest._retry) {
      clearStoredUser();
      window.location.href = '/login';
    }

    return Promise.reject(error);
  }
);

export default api;
