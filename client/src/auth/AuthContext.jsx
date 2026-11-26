import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { requestJson } from "../api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionError, setSessionError] = useState("");

  useEffect(() => {
    let active = true;
    requestJson("/api/auth/session")
      .then(({ user: sessionUser }) => {
        if (active) setUser(sessionUser);
      })
      .catch((error) => {
        if (active) {
          setUser(null);
          setSessionError(error instanceof Error ? error.message : "Could not check your session.");
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (credentials) => {
    const result = await requestJson("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(credentials),
    });
    setUser(result.user);
    setSessionError("");
    return result.user;
  }, []);

  const signup = useCallback(async (details) => {
    const result = await requestJson("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify(details),
    });
    setUser(result.user);
    setSessionError("");
    return result.user;
  }, []);

  const logout = useCallback(async () => {
    await requestJson("/api/auth/logout", { method: "POST" });
    setUser(null);
  }, []);

  const clearSessionError = useCallback(() => setSessionError(""), []);

  return (
    <AuthContext.Provider
      value={{ user, isLoading, sessionError, login, signup, logout, clearSessionError }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider.");
  return context;
}
