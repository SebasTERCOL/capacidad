import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, History, Eye, Clock, AlertTriangle, User, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useUserAuth } from "@/contexts/UserAuthContext";
import { LoginModal, UserBadge } from "@/components/ProductionCapacity/LoginModal";

interface Snapshot {
  id: string;
  created_at: string;
  created_by: string | null;
  user_cedula: string | null;
  month: number | null;
  year: number | null;
  use_inventory: boolean | null;
  input_data: any;
  combo_data: any;
  operator_config: any;
  overtime_config: any;
  projection_result: any;
  total_minutes: number | null;
  total_alerts: number | null;
}

const CapacityHistory = () => {
  const { currentUser, isAdministrativo } = useUserAuth();
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSnapshot, setSelectedSnapshot] = useState<Snapshot | null>(null);
  const [showLogin, setShowLogin] = useState(false);

  useEffect(() => {
    if (isAdministrativo) loadSnapshots();
  }, [isAdministrativo]);

  const loadSnapshots = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("capacity_snapshots")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error && data) setSnapshots(data as Snapshot[]);
    setLoading(false);
  };

  const formatTime = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  if (!currentUser || !isAdministrativo) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md w-full mx-4">
          <CardHeader>
            <CardTitle className="text-center">Acceso Restringido</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-muted-foreground">Solo personal Administrativo puede acceder al historial.</p>
            <Button onClick={() => setShowLogin(true)}>
              Iniciar Sesión
            </Button>
            <div>
              <Link to="/app">
                <Button variant="link">Volver a Capacidad</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
        <LoginModal open={showLogin} onOpenChange={setShowLogin} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <History className="h-8 w-8 text-primary" />
              <div>
                <h1 className="text-2xl font-bold">Historial de Escenarios</h1>
                <p className="text-muted-foreground">Snapshots guardados de corridas de capacidad</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <UserBadge />
              <Link to="/app">
                <Button variant="outline" size="sm">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Volver
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 max-w-6xl">
        {loading ? (
          <p className="text-center text-muted-foreground py-12">Cargando historial...</p>
        ) : snapshots.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <p className="text-muted-foreground">No hay escenarios guardados aún.</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Usuario</TableHead>
                    <TableHead>Período</TableHead>
                    <TableHead>Inventario</TableHead>
                    <TableHead>Total Horas</TableHead>
                    <TableHead>Alertas</TableHead>
                    <TableHead className="w-20">Ver</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {snapshots.map(s => (
                    <TableRow key={s.id}>
                      <TableCell className="whitespace-nowrap">
                        {new Date(s.created_at).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <User className="h-3.5 w-3.5 text-muted-foreground" />
                          {s.created_by || '—'}
                        </div>
                      </TableCell>
                      <TableCell>
                        {s.month && s.year ? `${s.month}/${s.year}` : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={s.use_inventory ? "default" : "secondary"}>
                          {s.use_inventory ? 'Sí' : 'No'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                          {s.total_minutes != null ? formatTime(s.total_minutes) : '—'}
                        </div>
                      </TableCell>
                      <TableCell>
                        {s.total_alerts != null && s.total_alerts > 0 ? (
                          <Badge variant="destructive" className="flex items-center gap-1 w-fit">
                            <AlertTriangle className="h-3 w-3" />
                            {s.total_alerts}
                          </Badge>
                        ) : (
                          <Badge variant="secondary">0</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => setSelectedSnapshot(s)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Detail Dialog */}
      <Dialog open={!!selectedSnapshot} onOpenChange={(open) => !open && setSelectedSnapshot(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          {selectedSnapshot && <SnapshotDetail snapshot={selectedSnapshot} />}
        </DialogContent>
      </Dialog>
    </div>
  );
};

const SnapshotDetail: React.FC<{ snapshot: Snapshot }> = ({ snapshot }) => {
  const formatTime = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const projection = snapshot.projection_result as any[] | null;
  const operatorConfig = snapshot.operator_config as any;
  const inputData = snapshot.input_data as any;

  return (
    <div className="space-y-6">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Detalle del Escenario — {new Date(snapshot.created_at).toLocaleString('es-CO')}
        </DialogTitle>
      </DialogHeader>

      {/* Resumen */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <div className="text-lg font-bold">{snapshot.month}/{snapshot.year}</div>
            <div className="text-xs text-muted-foreground">Período</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <div className="text-lg font-bold">{snapshot.created_by || '—'}</div>
            <div className="text-xs text-muted-foreground">Usuario</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <div className="text-lg font-bold">{snapshot.total_minutes != null ? formatTime(snapshot.total_minutes) : '—'}</div>
            <div className="text-xs text-muted-foreground">Total Tiempo</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <div className="text-lg font-bold text-destructive">{snapshot.total_alerts ?? 0}</div>
            <div className="text-xs text-muted-foreground">Alertas</div>
          </CardContent>
        </Card>
      </div>

      {/* Configuración de operarios */}
      {operatorConfig && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Configuración de Operarios</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm space-y-1">
              <p>Horas por turno: <strong>{operatorConfig.hoursPerShift ?? '—'}</strong></p>
              <p>Días hábiles: <strong>{operatorConfig.workingDays ?? '—'}</strong></p>
              {operatorConfig.operatorsByProcess && (
                <div className="mt-2">
                  <p className="font-medium mb-1">Operarios por proceso:</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(operatorConfig.operatorsByProcess).map(([proc, count]: [string, any]) => (
                      <Badge key={proc} variant="outline">{proc}: {count}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* PT Cargadas */}
      {inputData?.originalData && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">PT Cargadas ({inputData.originalData.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
              {inputData.originalData.map((item: any, i: number) => (
                <Badge key={i} variant="secondary">{item.referencia}: {item.cantidad}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Resultado de proyección */}
      {projection && projection.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Resultado de Proyección ({projection.length} registros)</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-96 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Referencia</TableHead>
                    <TableHead>Proceso</TableHead>
                    <TableHead>Máquina</TableHead>
                    <TableHead className="text-right">Cantidad</TableHead>
                    <TableHead className="text-right">SAM</TableHead>
                    <TableHead className="text-right">Tiempo</TableHead>
                    <TableHead className="text-right">Ocupación</TableHead>
                    <TableHead>Alerta</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projection.map((row: any, i: number) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{row.referencia}</TableCell>
                      <TableCell>{row.proceso}</TableCell>
                      <TableCell>{row.maquina}</TableCell>
                      <TableCell className="text-right">{row.cantidadRequerida}</TableCell>
                      <TableCell className="text-right">{row.sam?.toFixed(3)}</TableCell>
                      <TableCell className="text-right">{row.tiempoTotal?.toFixed(3)}m</TableCell>
                      <TableCell className="text-right">{row.ocupacionMaquina?.toFixed(1)}%</TableCell>
                      <TableCell>
                        {row.alerta && (
                          <Badge variant="destructive" className="text-xs">{row.alerta}</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default CapacityHistory;
