import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";
import { ChevronDown, ChevronRight, Factory, Settings, AlertTriangle, Link2, Clock, Calendar, Download, Save } from "lucide-react";
import { OvertimeShift } from "./OvertimeConfiguration";
import { useUserAuth } from "@/contexts/UserAuthContext";
interface ReferenceItem {
  referencia: string;
  cantidadRequerida: number;
  cantidadOriginal?: number; // Cantidad original sin descuento de inventario
  inventarioDisponible?: number; // Inventario disponible en products.quantity
  sam: number;
  tiempoTotal: number;
  ocupacionPorcentaje: number;
  alerta?: string;
}
interface MachineGroup {
  machineId: string;
  machineName: string;
  totalTime: number;
  totalMachineTime?: number; // Tiempo total considerando todos los procesos
  occupancy: number;
  capacity: number;
  references: ReferenceItem[];
  isShared?: boolean; // Si la máquina es compartida con otros procesos
  sharedWith?: string[]; // Lista de procesos que comparten esta máquina
  overtimeHours?: number; // Horas extras aplicadas
  overtimeShifts?: OvertimeShift; // Turnos extras configurados
}
interface ProcessGroup {
  processName: string;
  totalOccupancy: number;
  totalTime: number;
  availableHours: number;
  totalAvailableMinutes: number; // NUEVO: Tiempo total disponible incluyendo extras
  machines: MachineGroup[];
  effectiveStations: number;
  operators: number;
  sharedOperatorsWith?: string; // Nota si comparte operarios con otro proceso
}
interface HierarchicalCapacityViewProps {
  processGroups: ProcessGroup[];
  onBack: () => void;
  onStartOver: () => void;
  onNext?: () => void;
  hasDeficits?: boolean;
  onOptimizeWithOvertime?: () => void;
  onExportCSV?: () => void;
  onSaveSnapshot?: () => Promise<void>;
}
const HierarchicalCapacityView: React.FC<HierarchicalCapacityViewProps> = ({
  processGroups,
  onBack,
  onStartOver,
  onNext,
  hasDeficits = false,
  onOptimizeWithOvertime,
  onExportCSV,
  onSaveSnapshot
}) => {
  const [expandedProcesses, setExpandedProcesses] = useState<Set<string>>(new Set());
  const [expandedMachines, setExpandedMachines] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const { currentUser, isAdministrativo } = useUserAuth();

  const handleSave = async () => {
    if (!onSaveSnapshot) return;
    setIsSaving(true);
    try {
      await onSaveSnapshot();
    } finally {
      setIsSaving(false);
    }
  };
  const toggleProcess = (processName: string) => {
    const newExpanded = new Set(expandedProcesses);
    if (newExpanded.has(processName)) {
      newExpanded.delete(processName);
      // También cerrar todas las máquinas de este proceso
      processGroups.find(p => p.processName === processName)?.machines.forEach(m => {
        newExpanded.delete(`${processName}-${m.machineId}`);
      });
      setExpandedMachines(prev => {
        const newMachines = new Set(prev);
        processGroups.find(p => p.processName === processName)?.machines.forEach(m => {
          newMachines.delete(`${processName}-${m.machineId}`);
        });
        return newMachines;
      });
    } else {
      newExpanded.add(processName);
    }
    setExpandedProcesses(newExpanded);
  };
  const toggleMachine = (processName: string, machineId: string) => {
    const key = `${processName}-${machineId}`;
    const newExpanded = new Set(expandedMachines);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedMachines(newExpanded);
  };
  const getCapacityColorClass = (percentage: number) => {
    if (percentage >= 100) {
      return 'bg-capacity-critical text-capacity-critical-foreground border-capacity-critical';
    }
    if (percentage >= 80) {
      return 'bg-capacity-high text-capacity-high-foreground border-capacity-high';
    }
    if (percentage >= 40) {
      return 'bg-capacity-medium text-capacity-medium-foreground border-capacity-medium';
    }
    return 'bg-capacity-low text-capacity-low-foreground border-capacity-low';
  };
  const formatTime = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };
  return <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Factory className="h-6 w-6" />
            Análisis de Capacidad por Proceso
          </CardTitle>
          <p className="text-muted-foreground">
            Vista jerárquica: Proceso → Máquina → Referencia. Expande cada nivel para ver detalles.
          </p>
        </CardHeader>
      </Card>

      {/* Resumen General */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Resumen del Análisis</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-3 bg-muted rounded-lg">
              <div className="text-2xl font-bold">{processGroups.length}</div>
              <div className="text-sm text-muted-foreground">Procesos Analizados</div>
            </div>
            <div className="text-center p-3 bg-muted rounded-lg">
              <div className="text-2xl font-bold text-green-600">
                {processGroups.reduce((sum, p) => sum + p.machines.length, 0)}
              </div>
              <div className="text-sm text-muted-foreground">Máquinas Activas</div>
            </div>
            <div className="text-center p-3 bg-muted rounded-lg">
              <div className="text-2xl font-bold text-blue-600">
                {(() => {
                // Calcular estaciones sin duplicar Troquelado/Despunte
                const hasTroquelado = processGroups.some(p => p.processName === 'Troquelado');
                const hasDespunte = processGroups.some(p => p.processName === 'Despunte');
                let total = 0;
                processGroups.forEach(p => {
                  // Si es Despunte y Troquelado ya existe, no sumar (ya se contó en Troquelado)
                  if (p.processName === 'Despunte' && hasTroquelado) {
                    return;
                  }
                  total += p.effectiveStations;
                });
                return total;
              })()}
              </div>
              <div className="text-sm text-muted-foreground">Estaciones Productivas</div>
            </div>
            <div className="text-center p-3 bg-muted rounded-lg">
              <div className="text-2xl font-bold">
                {(() => {
                // Sumar tiempos sin duplicar (ya cada proceso tiene su tiempo individual)
                const totalTime = processGroups.reduce((sum, p) => sum + p.totalTime, 0);
                return formatTime(totalTime);
              })()}
              </div>
              <div className="text-sm text-muted-foreground">Tiempo Total Requerido</div>
            </div>
            <div className="text-center p-3 bg-muted rounded-lg">
              <div className="text-2xl font-bold text-green-600">
                {(() => {
                // Calcular tiempo disponible incluyendo extras, sin duplicar Troquelado/Despunte
                const hasTroquelado = processGroups.some(p => p.processName === 'Troquelado');
                const hasDespunte = processGroups.some(p => p.processName === 'Despunte');
                let totalTime = 0;
                processGroups.forEach(p => {
                  // Si es Despunte y Troquelado ya existe, no sumar (ya se contó en Troquelado)
                  if (p.processName === 'Despunte' && hasTroquelado) {
                    return;
                  }
                  totalTime += p.totalAvailableMinutes;
                });
                return formatTime(totalTime);
              })()}
              </div>
              <div className="text-sm text-muted-foreground">Tiempo Total Disponible</div>
            </div>
            <div className="text-center p-3 bg-muted rounded-lg">
              <div className="text-2xl font-bold text-amber-600">
                {(() => {
                // Sumar todos los tiempos requeridos (ya incluye Troquelado + Despunte correctamente)
                const totalRequired = processGroups.reduce((sum, p) => sum + p.totalTime, 0);

                // Calcular tiempo disponible incluyendo extras, sin duplicar Troquelado/Despunte
                const hasTroquelado = processGroups.some(p => p.processName === 'Troquelado');
                const hasDespunte = processGroups.some(p => p.processName === 'Despunte');
                let totalAvailable = 0;
                processGroups.forEach(p => {
                  // Si es Despunte y Troquelado ya existe, no sumar (ya se contó en Troquelado)
                  if (p.processName === 'Despunte' && hasTroquelado) {
                    return;
                  }
                  totalAvailable += p.totalAvailableMinutes;
                });
                const occupancyPercentage = totalAvailable > 0 ? totalRequired / totalAvailable * 100 : 0;
                return `${occupancyPercentage.toFixed(1)}%`;
              })()}
              </div>
              <div className="text-sm text-muted-foreground">Ocupación de Planta</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Vista Jerárquica por Procesos */}
      <div className="space-y-4">
        {processGroups.map(process => <Card key={process.processName}>
            <Collapsible open={expandedProcesses.has(process.processName)} onOpenChange={() => toggleProcess(process.processName)}>
              <CollapsibleTrigger asChild>
                <CardHeader className="hover:bg-muted/50 cursor-pointer transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {expandedProcesses.has(process.processName) ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                      <CardTitle className="text-xl flex items-center gap-2">
                        <Factory className="h-5 w-5" />
                        PROCESO: {process.processName.toUpperCase()}
                      </CardTitle>
                      {process.sharedOperatorsWith && <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                                <Link2 className="h-3 w-3 mr-1" />
                                Operarios compartidos
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-xs">{process.sharedOperatorsWith}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>}
          <Badge className={getCapacityColorClass(process.totalOccupancy) + " text-sm my-0 rounded-none"}>
            {process.totalOccupancy.toFixed(1)}% Ocupación
            {process.sharedOperatorsWith ? <>
                {' '}({formatTime(process.totalTime)} requerido)
              </> : <>
                {' '}({formatTime(process.totalTime)} / {formatTime(process.totalAvailableMinutes)})
              </>}
          </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>{process.machines.length} máquinas</span>
                      <span>{process.operators} operarios</span>
                      <span>{formatTime(process.totalTime)} trabajo</span>
                    </div>
                  </div>
                </CardHeader>
              </CollapsibleTrigger>

              <CollapsibleContent>
                <CardContent className="pt-0">
                  <div className="space-y-3 ml-8">
                    {process.machines.map(machine => <Card key={machine.machineId} className="border-l-4 border-l-primary/20">
                        <Collapsible open={expandedMachines.has(`${process.processName}-${machine.machineId}`)} onOpenChange={() => toggleMachine(process.processName, machine.machineId)}>
                          <CollapsibleTrigger asChild>
                            <CardHeader className="pb-3 hover:bg-muted/30 cursor-pointer transition-colors">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  {expandedMachines.has(`${process.processName}-${machine.machineId}`) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                  <CardTitle className="text-lg flex items-center gap-2">
                                    <Settings className="h-4 w-4" />
                                    Máquina {machine.machineName}
                                  </CardTitle>
                                  {machine.isShared && <Tooltip>
                                      <TooltipTrigger>
                                        <Badge variant="outline" className="text-xs flex items-center gap-1">
                                          <Link2 className="h-3 w-3" />
                                          Compartida
                                        </Badge>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>Compartida con: {machine.sharedWith?.join(', ')}</p>
                                      </TooltipContent>
                                    </Tooltip>}
                  <Badge className={getCapacityColorClass(machine.occupancy) + " text-xs"}>
                    {machine.occupancy.toFixed(1)}% - {formatTime(machine.totalTime)} / {formatTime(machine.capacity)}
                  </Badge>
                  {machine.isShared && machine.totalMachineTime && machine.totalMachineTime !== machine.totalTime && <span className="text-xs text-muted-foreground">
                      (Total máquina: {formatTime(machine.totalMachineTime)})
                    </span>}
                  {machine.overtimeHours && machine.overtimeHours > 0 && <>
                      <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                        <Clock className="h-3 w-3 mr-1" />
                        +{formatTime(machine.overtimeHours * 60)} extras
                      </Badge>
                      
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                              <Calendar className="h-3 w-3 mr-1" />
                              Domingos
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            <div className="text-xs">
                              <div className="font-semibold mb-1">Turnos extra:</div>
                              {machine.overtimeShifts?.turno1 && <div>✓ Turno 1 (5:00am - 1:00pm - 8h)</div>}
                              {machine.overtimeShifts?.turno2 && <div>✓ Turno 2 (1:00pm - 9:00pm - 8h)</div>}
                              {machine.overtimeShifts?.turno3 && <div>✓ Turno 3 (9:00pm - 5:00am - 8h)</div>}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </>}
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  {machine.references.length} referencia{machine.references.length !== 1 ? 's' : ''}
                                </div>
                              </div>
                              
                              {/* Progress Bar de Ocupación */}
                              <div className="space-y-1 min-w-[200px]">
                                <div className="flex justify-between text-xs text-muted-foreground">
                                  <span>Ocupación</span>
                                  <span className={machine.occupancy > 100 ? 'text-red-600 font-semibold' : ''}>
                                    {machine.occupancy.toFixed(1)}%
                                    {machine.overtimeHours && machine.overtimeHours > 0 && <span className="text-purple-600 ml-1">
                                        (con extras)
                                      </span>}
                                  </span>
                                </div>
                                <Progress value={Math.min(100, machine.occupancy)} className={`h-2 ${machine.overtimeHours && machine.overtimeHours > 0 ? 'bg-purple-100' : ''}`} />
                              </div>
                            </CardHeader>
                          </CollapsibleTrigger>

                          <CollapsibleContent>
                            <CardContent className="pt-0">
                              <div className="space-y-2 ml-8">
                                {machine.references.map((ref, index) => <div key={index} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border-l-2 border-l-secondary">
                                    <div className="flex items-center gap-3">
                                      <div className="font-medium">Ref {ref.referencia}</div>
                                      {ref.alerta && <AlertTriangle className="h-4 w-4 text-amber-500" />}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-4 text-sm">
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <span className="text-muted-foreground cursor-help underline decoration-dotted">
                                              Cant: <span className="font-medium text-foreground">{ref.cantidadRequerida}</span>
                                            </span>
                                          </TooltipTrigger>
                                          <TooltipContent side="top" className="max-w-xs">
                                            <div className="text-xs space-y-1">
                                              <div className="font-semibold border-b pb-1 mb-1">Desglose de Inventario</div>
                                              <div className="flex justify-between gap-4">
                                                <span>Requerido (original):</span>
                                                <span className="font-medium">{ref.cantidadOriginal ?? ref.cantidadRequerida}</span>
                                              </div>
                                              <div className="flex justify-between gap-4">
                                                <span>Inventario disponible:</span>
                                                <span className="font-medium text-green-600">{ref.inventarioDisponible ?? 0}</span>
                                              </div>
                                              <div className="flex justify-between gap-4 border-t pt-1 mt-1">
                                                <span>Cantidad efectiva:</span>
                                                <span className="font-bold">{ref.cantidadRequerida}</span>
                                              </div>
                                              {(ref.inventarioDisponible ?? 0) > 0 && (
                                                <div className="text-muted-foreground italic mt-1">
                                                  ✓ Inventario aplicado
                                                </div>
                                              )}
                                            </div>
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                      <span className="text-muted-foreground">
                                        SAM: <span className="font-medium text-foreground">{ref.sam.toFixed(3)}</span>
                                      </span>
                                      <span className="text-muted-foreground">
                                        Tiempo: <span className="font-medium text-foreground">{ref.tiempoTotal < 1 ? `${ref.tiempoTotal.toFixed(3)}m` : formatTime(ref.tiempoTotal)}</span>
                                      </span>
                                      <Badge className={getCapacityColorClass(ref.ocupacionPorcentaje) + " text-xs"}>
                                        {ref.ocupacionPorcentaje.toFixed(1)}%
                                      </Badge>
                                      {ref.alerta && <span className={`text-xs ${ref.sam === 0 || ref.alerta.toLowerCase().includes('falta sam') ? 'text-destructive' : 'text-muted-foreground'}`}>
                                          {ref.alerta}
                                        </span>}
                                    </div>
                                  </div>)}
                                
                                {machine.references.length === 0 && <div className="text-center py-4 text-muted-foreground">
                                    Sin operario asignado - Máquina disponible
                                  </div>}
                              </div>
                            </CardContent>
                          </CollapsibleContent>
                        </Collapsible>
                      </Card>)}
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>)}
      </div>

      {/* Botones de navegación */}
      <div className="flex gap-2 flex-wrap">
        <Button variant="outline" onClick={onBack}>
          Volver a Configuración
        </Button>
        {onExportCSV && <Button variant="outline" onClick={onExportCSV}>
            <Download className="h-4 w-4 mr-2" />
            Exportar CSV
          </Button>}
        {onSaveSnapshot && isAdministrativo && (
          <Button variant="outline" onClick={handleSave} disabled={isSaving}>
            <Save className="h-4 w-4 mr-2" />
            {isSaving ? 'Guardando...' : 'Guardar Escenario'}
          </Button>
        )}
        {hasDeficits && onOptimizeWithOvertime && <Button variant="secondary" onClick={onOptimizeWithOvertime} className="flex-1">
            <Clock className="h-4 w-4 mr-2" />
            Optimizar con Horas Extras
          </Button>}
        <Button variant="secondary" onClick={onStartOver}>
          Nuevo Análisis
        </Button>
        {onNext && <Button onClick={onNext} className="flex-1">
            Scheduling (CPM + RCPSP) →
          </Button>}
      </div>
    </div>;
};
export default HierarchicalCapacityView;