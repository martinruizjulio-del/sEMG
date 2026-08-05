import { createContext, useContext, useState, useCallback } from "react";
import { api, setToken } from "../lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [authed, setAuthed] = useState(() => !!localStorage.getItem("semg_token"));

  const requestCode = useCallback((email) => api.requestCode(email), []);

  const verifyCode = useCallback(async (email, code) => {
    const { access_token } = await api.verifyCode(email, code);
    setToken(access_token);
    setAuthed(true);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setAuthed(false);
  }, []);

  return (
    <AuthContext.Provider value={{ authed, requestCode, verifyCode, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
