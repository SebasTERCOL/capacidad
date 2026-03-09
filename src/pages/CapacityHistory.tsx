import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, History, Eye, AlertTriangle, User, Calendar, Factory, ChevronDown, ChevronRight, Settings, Search, Filter } from "lucide-react";
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

// Compute occupation from snapshot data
const computeOccupation = (snapshot: Snapshot): number | null => {
  const projection = snapshot.projection_result as any[] | null;
  const opConfig = snapshot.operator_config as any;
  if (!projection || !opConfig?.processes) return null;

  const totalRequired = projection.reduce((sum: number, r: any) => sum + (r.tiempoTotal || 0), 0);

  // Sum available minutes from process configs
  let totalAvailable = 0;
  const processes = opConfig.processes as any[];
  for (const proc of processes) {
    const hours = proc.availableHours || 0;
    totalAvailable += hours * 60;
  }

  if (totalAvailable <= 0) return null;
  return (totalRequired / totalAvailable) * 100;
};

const getOccupationColor = (pct: number) => {
  if (pct > 100) return 'text-red-600 font-bold';
  if (pct >= 80) return 'text-yellow-600 font-semibold';
  return 'text-green-600 font-semibold';
};

const getOccupationBadgeVariant = (pct: number): "destructive" | "secondary" | "default" => {
  if (pct > 100) return 'destructive';
  if (pct >= 80) return 'secondary';
  return 'default';
};

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

  if (!currentUser || !isAdministrativo) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md w-full mx-4">
          <CardHeader>
            <CardTitle className="text-center">Acceso Restringido</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-muted-foreground">Solo personal Administrativo puede acceder al historial.</p>
            <Button onClick={() => setShowLogin(true)}>Iniciar Sesión</Button>
            <div>
              <Link to="/app"><Button variant="link">Volver a Capacidad</Button></Link>
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
          <div className="space-y-3 py-6">
            {[1,2,3].map(i => (
              <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : snapshots.length === 0 ? (
          <Card>
            <CardContent className="text-center py-16 space-y-4">
              <History className="h-12 w-12 mx-auto text-muted-foreground/40" />
              <p className="text-muted-foreground font-medium">No hay escenarios guardados aún.</p>
              <p className="text-xs text-muted-foreground">Los escenarios aparecerán aquí cuando guardes una corrida de capacidad.</p>
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
                    <TableHead>Ocupación Total (%)</TableHead>
                    <TableHead>Alertas</TableHead>
                    <TableHead className="w-20">Ver</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {snapshots.map(s => {
                    const occupation = computeOccupation(s);
                    return (
                      <TableRow key={s.id} className="hover:bg-muted/50 transition-colors">
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
                          {occupation != null ? (
                            <span className={getOccupationColor(occupation)}>
                              {occupation.toFixed(1)}%
                              {occupation > 100 && ' 🔴'}
                            </span>
                          ) : '—'}
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
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Detail Dialog */}
      <Dialog open={!!selectedSnapshot} onOpenChange={(open) => !open && setSelectedSnapshot(null)}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          {selectedSnapshot && <SnapshotDetail snapshot={selectedSnapshot} />}
        </DialogContent>
      </Dialog>
    </div>
  );
};

// =================== SNAPSHOT DETAIL ===================

const SnapshotDetail: React.FC<{ snapshot: Snapshot }> = ({ snapshot }) => {
  const projection = snapshot.projection_result as any[] | null;
  const operatorConfig = snapshot.operator_config as any;
  const inputData = snapshot.input_data as any;

  // Compute capacity general
  const totalRequired = projection?.reduce((sum: number, r: any) => sum + (r.tiempoTotal || 0), 0) || 0;
  let totalAvailable = 0;
  const processes = (operatorConfig?.processes as any[]) || [];
  for (const proc of processes) {
    totalAvailable += (proc.availableHours || 0) * 60;
  }
  const occupationPct = totalAvailable > 0 ? (totalRequired / totalAvailable) * 100 : 0;

  return (
    <div className="space-y-6">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Detalle del Escenario — {new Date(snapshot.created_at).toLocaleString('es-CO')}
        </DialogTitle>
      </DialogHeader>

      {/* Sección 1: Capacidad General */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Factory className="h-4 w-4" />
            Capacidad General
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-4 bg-muted rounded-lg">
              <div className="text-lg font-bold">{(totalRequired / 60).toFixed(0)}h</div>
              <div className="text-xs text-muted-foreground">Requerido Total</div>
            </div>
            <div className="text-center p-4 bg-muted rounded-lg">
              <div className="text-lg font-bold text-green-600">{(totalAvailable / 60).toFixed(0)}h</div>
              <div className="text-xs text-muted-foreground">Disponible Total</div>
            </div>
            <div className="text-center p-4 bg-muted rounded-lg">
              <div className={`text-lg font-bold ${getOccupationColor(occupationPct)}`}>
                {occupationPct.toFixed(1)}%{occupationPct > 100 && ' 🔴'}
              </div>
              <div className="text-xs text-muted-foreground">Ocupación Total</div>
            </div>
          </div>
          <Progress value={Math.min(100, occupationPct)} className="h-2 mt-3" />
        </CardContent>
      </Card>

      {/* Sección 2: Configuración por Proceso */}
      {processes.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Configuración por Proceso
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Proceso</TableHead>
                  <TableHead className="text-center">Operarios</TableHead>
                  <TableHead className="text-center">Eficiencia</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {processes.map((proc: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{proc.processName || `Proceso ${i+1}`}</TableCell>
                    <TableCell className="text-center">{proc.operatorCount ?? '—'}</TableCell>
                    <TableCell className="text-center">{proc.efficiency != null ? `${proc.efficiency}%` : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Sección 3: PT Cargadas (colapsable) */}
      {inputData?.originalData && <PTListCollapsible data={inputData.originalData} />}

      {/* Sección 4: Resultado de Proyección (jerárquico) */}
      {projection && projection.length > 0 && <ProjectionHierarchical projection={projection} />}
    </div>
  );
};

// =================== PT LIST COLLAPSIBLE ===================

const PTListCollapsible: React.FC<{ data: any[] }> = ({ data }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = search
    ? data.filter((item: any) => item.referencia?.toLowerCase().includes(search.toLowerCase()))
    : data;

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              PT Cargadas ({data.length})
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar referencia..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
            <div className="max-h-60 overflow-y-auto space-y-1">
              {filtered.map((item: any, i: number) => (
                <div key={i} className="flex justify-between px-3 py-1.5 text-sm rounded hover:bg-muted/50">
                  <span className="font-medium">{item.referencia}</span>
                  <span className="text-muted-foreground">{Number(item.cantidad).toLocaleString()}</span>
                </div>
              ))}
              {filtered.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">Sin resultados</p>
              )}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};

// =================== PROJECTION HIERARCHICAL ===================

interface ProcessNode {
  name: string;
  totalTime: number;
  machines: Map<string, MachineNode>;
}

interface MachineNode {
  name: string;
  totalTime: number;
  refs: any[];
}

const ProjectionHierarchical: React.FC<{ projection: any[] }> = ({ projection }) => {
  const [expandedProcesses, setExpandedProcesses] = useState<Set<string>>(new Set());
  const [expandedMachines, setExpandedMachines] = useState<Set<string>>(new Set());
  const [searchRef, setSearchRef] = useState('');
  const [filterProcess, setFilterProcess] = useState('all');
  const [filterMachine, setFilterMachine] = useState('all');
  const [filterAlert, setFilterAlert] = useState<'all' | 'critical'>('all');

  // Build hierarchy
  const processMap = new Map<string, ProcessNode>();
  for (const row of projection) {
    const procName = row.proceso || 'Sin Proceso';
    const machName = row.maquina || 'Sin Máquina';

    if (!processMap.has(procName)) {
      processMap.set(procName, { name: procName, totalTime: 0, machines: new Map() });
    }
    const proc = processMap.get(procName)!;
    proc.totalTime += row.tiempoTotal || 0;

    if (!proc.machines.has(machName)) {
      proc.machines.set(machName, { name: machName, totalTime: 0, refs: [] });
    }
    const mach = proc.machines.get(machName)!;
    mach.totalTime += row.tiempoTotal || 0;
    mach.refs.push(row);
  }

  const allProcesses = Array.from(processMap.keys()).sort();
  const allMachines = [...new Set(projection.map((r: any) => r.maquina || 'Sin Máquina'))].sort();

  // Apply filters
  let filteredProcesses = Array.from(processMap.values());
  if (filterProcess !== 'all') {
    filteredProcesses = filteredProcesses.filter(p => p.name === filterProcess);
  }

  // Filter machines and refs
  filteredProcesses = filteredProcesses.map(proc => {
    let machines = Array.from(proc.machines.values());
    if (filterMachine !== 'all') {
      machines = machines.filter(m => m.name === filterMachine);
    }
    machines = machines.map(m => {
      let refs = m.refs;
      if (searchRef) {
        refs = refs.filter((r: any) => r.referencia?.toLowerCase().includes(searchRef.toLowerCase()));
      }
      if (filterAlert === 'critical') {
        refs = refs.filter((r: any) => r.alerta);
      }
      return { ...m, refs, totalTime: refs.reduce((s: number, r: any) => s + (r.tiempoTotal || 0), 0) };
    }).filter(m => m.refs.length > 0);

    return {
      ...proc,
      machines: new Map(machines.map(m => [m.name, m])),
      totalTime: machines.reduce((s, m) => s + m.totalTime, 0)
    };
  }).filter(p => p.machines.size > 0);

  const toggleProcess = (name: string) => {
    setExpandedProcesses(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const toggleMachine = (key: string) => {
    setExpandedMachines(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const formatTime = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const getCapacityColor = (pct: number) => {
    if (pct >= 100) return 'text-red-600';
    if (pct >= 80) return 'text-yellow-600';
    return 'text-green-600';
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Factory className="h-4 w-4" />
          Resultado de Proyección ({projection.length} registros)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Filtros */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar referencia..."
              value={searchRef}
              onChange={e => setSearchRef(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
          </div>
          <Select value={filterProcess} onValueChange={setFilterProcess}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Proceso" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los procesos</SelectItem>
              {allProcesses.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterMachine} onValueChange={setFilterMachine}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Máquina" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las máquinas</SelectItem>
              {allMachines.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterAlert} onValueChange={(v) => setFilterAlert(v as 'all' | 'critical')}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Alertas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="critical">Solo con alerta</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Hierarchical view */}
        <div className="space-y-2 max-h-[500px] overflow-y-auto">
          {filteredProcesses.map(proc => {
            const machines = Array.from(proc.machines.values());
            // Compute process-level occupation if available
            const procOccupation = projection.find((r: any) => r.proceso === proc.name)?.ocupacionProceso;

            return (
              <div key={proc.name} className="border rounded-lg overflow-hidden">
                {/* NIVEL 1 - Proceso */}
                <button
                  className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors text-left"
                  onClick={() => toggleProcess(proc.name)}
                >
                  <div className="flex items-center gap-2">
                    {expandedProcesses.has(proc.name) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <Factory className="h-4 w-4 text-primary" />
                    <span className="font-semibold">{proc.name.toUpperCase()}</span>
                    {procOccupation != null && (
                      <Badge variant={getOccupationBadgeVariant(procOccupation)} className="text-xs">
                        {procOccupation.toFixed(1)}%
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <span>{machines.length} máq.</span>
                    <span>{formatTime(proc.totalTime)}</span>
                  </div>
                </button>

                {/* NIVEL 2 - Máquinas */}
                {expandedProcesses.has(proc.name) && (
                  <div className="border-t bg-muted/20">
                    {machines.map(mach => {
                      const machKey = `${proc.name}-${mach.name}`;
                      const machOccupation = mach.refs[0]?.ocupacionMaquina;

                      return (
                        <div key={mach.name}>
                          <button
                            className="w-full flex items-center justify-between p-2.5 pl-8 hover:bg-muted/50 transition-colors text-left border-b border-border/50"
                            onClick={() => toggleMachine(machKey)}
                          >
                            <div className="flex items-center gap-2">
                              {expandedMachines.has(machKey) ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                              <Settings className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="font-medium text-sm">{mach.name}</span>
                              {machOccupation != null && (
                                <span className={`text-xs font-semibold ${getCapacityColor(machOccupation)}`}>
                                  ({machOccupation.toFixed(1)}%)
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground">{mach.refs.length} refs · {formatTime(mach.totalTime)}</span>
                          </button>

                          {/* NIVEL 3 - Referencias */}
                          {expandedMachines.has(machKey) && (
                            <div className="bg-background">
                              <Table>
                                <TableHeader>
                                  <TableRow className="text-xs">
                                    <TableHead className="pl-12">Referencia</TableHead>
                                    <TableHead className="text-right">Cantidad</TableHead>
                                    <TableHead className="text-right">SAM</TableHead>
                                    <TableHead className="text-right">Tiempo</TableHead>
                                    <TableHead className="text-right">Ocupación</TableHead>
                                    <TableHead>Alerta</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {mach.refs.map((ref: any, idx: number) => (
                                    <TableRow key={idx} className="text-sm">
                                      <TableCell className="pl-12 font-medium">{ref.referencia}</TableCell>
                                      <TableCell className="text-right">{ref.cantidadRequerida?.toLocaleString()}</TableCell>
                                      <TableCell className="text-right">{ref.sam?.toFixed(3)}</TableCell>
                                      <TableCell className="text-right">{ref.tiempoTotal?.toFixed(1)}m</TableCell>
                                      <TableCell className="text-right">
                                        {ref.ocupacionMaquina != null && (
                                          <span className={getCapacityColor(ref.ocupacionMaquina)}>
                                            {ref.ocupacionMaquina.toFixed(1)}%
                                          </span>
                                        )}
                                      </TableCell>
                                      <TableCell>
                                        {ref.alerta && (
                                          <Badge variant="destructive" className="text-xs">{ref.alerta}</Badge>
                                        )}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {filteredProcesses.length === 0 && (
            <p className="text-center text-muted-foreground py-8 text-sm">Sin resultados para los filtros seleccionados</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default CapacityHistory;
