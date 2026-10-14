import axios from 'axios';
import { API_URL, AUTH_URL } from './config';

export const api = axios.create({ baseURL: API_URL, timeout: 30000 });
export const authApi = axios.create({ baseURL: AUTH_URL, withCredentials: true, timeout: 15000 });

let sessionRefreshHandler;
let sessionRefreshPromise;

export function setSessionRefreshHandler(handler) {
  sessionRefreshHandler = handler;
}

async function requestWithRefresh(client, accessToken, request) {
  const withToken = (token) => ({ ...request, headers: { ...request.headers, Authorization: `Bearer ${token}` } });
  try {
    return await client.request(withToken(accessToken));
  } catch (error) {
    if (error.response?.status !== 401 || !sessionRefreshHandler) throw error;
    if (!sessionRefreshPromise) {
      sessionRefreshPromise = sessionRefreshHandler().finally(() => { sessionRefreshPromise = undefined; });
    }
    const session = await sessionRefreshPromise;
    return client.request(withToken(session.accessToken));
  }
}

export function apiRequest(accessToken, request) {
  return requestWithRefresh(api, accessToken, request);
}

export function authRequest(accessToken, request) {
  return requestWithRefresh(authApi, accessToken, request);
}
