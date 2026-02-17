import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useUserAuth } from "@/contexts/UserAuthContext";
import { LogIn, LogOut, User } from "lucide-react";

interface LoginModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ open, onOpenChange }) => {
  const [cedula, setCedula] = useState('');
  const { login, isLoading, error } = useUserAuth();

  const handleLogin = async () => {
    if (!cedula.trim()) return;
    const success = await login(cedula.trim());
    if (success) {
      onOpenChange(false);
      setCedula('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LogIn className="h-5 w-5" />
            Ingreso de Usuario
          </DialogTitle>
          <DialogDescription>
            Ingrese su número de cédula para acceder al sistema de capacidad.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <Input
            placeholder="Número de cédula"
            value={cedula}
            onChange={(e) => setCedula(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            type="number"
            disabled={isLoading}
          />
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <Button onClick={handleLogin} disabled={isLoading || !cedula.trim()} className="w-full">
            {isLoading ? 'Verificando...' : 'Ingresar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export const UserBadge: React.FC = () => {
  const { currentUser, logout } = useUserAuth();
  const [showLogin, setShowLogin] = useState(false);

  if (!currentUser) {
    return (
      <>
        <Button variant="outline" size="sm" onClick={() => setShowLogin(true)}>
          <LogIn className="h-4 w-4 mr-2" />
          Iniciar Sesión
        </Button>
        <LoginModal open={showLogin} onOpenChange={setShowLogin} />
      </>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Badge variant="secondary" className="flex items-center gap-1.5 py-1">
        <User className="h-3.5 w-3.5" />
        {currentUser.nombre_completo}
      </Badge>
      <Button variant="ghost" size="sm" onClick={logout}>
        <LogOut className="h-4 w-4" />
      </Button>
    </div>
  );
};
