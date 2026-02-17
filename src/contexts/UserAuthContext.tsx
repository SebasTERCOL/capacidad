import React, { createContext, useContext, useState, useCallback } from 'react';
import { supabase } from "@/integrations/supabase/client";

interface UserData {
  id: number;
  nombre_completo: string;
  cedula: number;
  tipo: string;
  personal_estado: string | null;
}

interface UserAuthContextType {
  currentUser: UserData | null;
  isAdministrativo: boolean;
  isLoading: boolean;
  error: string | null;
  login: (cedula: string) => Promise<boolean>;
  logout: () => void;
}

const UserAuthContext = createContext<UserAuthContextType | null>(null);

export const useUserAuth = () => {
  const ctx = useContext(UserAuthContext);
  if (!ctx) throw new Error('useUserAuth must be used within UserAuthProvider');
  return ctx;
};

export const UserAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<UserData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = useCallback(async (cedula: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: dbError } = await supabase
        .from("personal")
        .select("*")
        .eq("cedula", Number(cedula))
        .maybeSingle();

      if (dbError) {
        setError("Error consultando la base de datos");
        return false;
      }
      if (!data) {
        setError("Usuario no encontrado");
        return false;
      }
      if (data.personal_estado && data.personal_estado !== 'Activo') {
        setError("Usuario inactivo");
        return false;
      }
      if (data.tipo !== 'Administrativo') {
        setError("Acceso restringido. Solo personal Administrativo puede usar esta función.");
        return false;
      }
      setCurrentUser(data as UserData);
      return true;
    } catch {
      setError("Error inesperado");
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    setCurrentUser(null);
    setError(null);
  }, []);

  const isAdministrativo = currentUser?.tipo === 'Administrativo';

  return (
    <UserAuthContext.Provider value={{ currentUser, isAdministrativo, isLoading, error, login, logout }}>
      {children}
    </UserAuthContext.Provider>
  );
};
