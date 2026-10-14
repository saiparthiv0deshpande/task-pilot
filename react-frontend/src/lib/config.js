function requiredEnv(name, value) {
  if (!value || !value.trim()) throw new Error(`Missing required frontend configuration: ${name}`);
  return value.trim().replace(/\/$/, '');
}

export const AUTH_URL = requiredEnv('VITE_AUTH_URL', import.meta.env.VITE_AUTH_URL);
export const API_URL = requiredEnv('VITE_API_URL', import.meta.env.VITE_API_URL);
