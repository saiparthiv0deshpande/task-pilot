import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authApi, setSessionRefreshHandler } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [accessToken, setAccessToken] = useState(null);
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [githubEnabled, setGithubEnabled] = useState(false);

  const saveSession = useCallback((payload) => {
    setAccessToken(payload.accessToken);
    setUser(payload.user);
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      const response = await authApi.post('/auth/refresh');
      saveSession(response.data);
      return response.data;
    } catch (error) {
      setAccessToken(null);
      setUser(null);
      throw error;
    }
  }, [saveSession]);

  useEffect(() => { setSessionRefreshHandler(refreshSession); }, [refreshSession]);

  useEffect(() => {
    let active = true;
    authApi.post('/auth/refresh')
      .then((response) => { if (active) saveSession(response.data); })
      .catch(() => { if (active) { setAccessToken(null); setUser(null); } })
      .finally(() => { if (active) setIsLoading(false); });
    authApi.get('/auth/providers')
      .then(response => { if (active) setGithubEnabled(Boolean(response.data.githubEnabled)); })
      .catch(() => { if (active) setGithubEnabled(false); });
    return () => { active = false; };
  }, [saveSession]);

  const logout = useCallback(async () => {
    try { await authApi.post('/auth/logout'); } finally {
      setAccessToken(null);
      setUser(null);
    }
  }, []);

  const value = useMemo(() => ({ accessToken, user, isLoading, githubEnabled, saveSession, refreshSession, logout, setUser }), [accessToken, user, isLoading, githubEnabled, saveSession, refreshSession, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
