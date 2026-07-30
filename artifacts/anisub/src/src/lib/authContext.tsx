import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { onAuth, type User } from "./auth";

interface AuthCtx {
  user: User | null;
  authLoading: boolean;
  previewMode: boolean;
  setPreviewMode: (v: boolean) => void;
}

const AuthContext = createContext<AuthCtx>({
  user: null, authLoading: false, previewMode: false, setPreviewMode: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);

  useEffect(() => {
    const unsub = onAuth(u => {
      setUser(u);
      setAuthLoading(false);
      if (u) setPreviewMode(false);
    });
    return unsub;
  }, []);

  return (
    <AuthContext.Provider value={{ user, authLoading, previewMode, setPreviewMode }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
