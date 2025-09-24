import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, Factory, Settings, AlertTriangle } from "lucide-react";

interface ReferenceItem {
  referencia: string;
  cantidadRequerida: number;
  sam: number;
  tiempoTotal: number;
  ocupacionPorcentaje: number;
  alerta?: string;
}

interface MachineGroup {
  machineId: string;
  machineName: string;
  totalTime: number;
  occupancy: number;
  capacity: number;
  references: ReferenceItem[];
}

interface ProcessGroup {
  processName: string;
  totalOccupancy: number;
  totalTime: number;
  availableHours: number;
  machines: MachineGroup[];
  effectiveStations: number;
  operators: number;
}

interface HierarchicalCapacityViewProps {
  processGroups: ProcessGroup[];
  onBack: () => void;
  onStartOver: () => void;
}

const HierarchicalCapacityView: React.FC<HierarchicalCapacityViewProps> = ({
  processGroups,
  onBack,
  onStartOver
}) => {
  const [expandedProcesses, setExpandedProcesses] = useState<Set<string>>(new Set());
  const [expandedMachines, setExpandedMachines] = useState<Set<string>>(new Set());

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

  const getOccupancyVariant = (occupancy: number) => {
    if (occupancy >= 90) return 'destructive';
    if (occupancy >= 70) return 'secondary';
    return 'default';
  };

  const formatTime = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  return (
    <div className="space-y-6">
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
                {processGroups.reduce((sum, p) => sum + p.effectiveStations, 0)}
              </div>
              <div className="text-sm text-muted-foreground">Estaciones Productivas</div>
            </div>
            <div className="text-center p-3 bg-muted rounded-lg">
              <div className="text-2xl font-bold text-primary">
                {formatTime(processGroups.reduce((sum, p) => sum + p.totalTime, 0))}
              </div>
              <div className="text-sm text-muted-foreground">Tiempo Total Requerido</div>
            </div>
            <div className="text-center p-3 bg-muted rounded-lg">
              <div className="text-2xl font-bold text-green-600">
                {formatTime(processGroups.reduce((sum, p) => sum + (p.effectiveStations * p.availableHours * 60), 0))}
              </div>
              <div className="text-sm text-muted-foreground">Tiempo Total Disponible</div>
            </div>
            <div className="text-center p-3 bg-muted rounded-lg">
              <div className="text-2xl font-bold text-amber-600">
                {(() => {
                  const totalRequired = processGroups.reduce((sum, p) => sum + p.totalTime, 0);
                  const totalAvailable = processGroups.reduce((sum, p) => sum + (p.effectiveStations * p.availableHours * 60), 0);
                  const occupancyPercentage = totalAvailable > 0 ? (totalRequired / totalAvailable) * 100 : 0;
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
        {processGroups.map((process) => (
          <Card key={process.processName}>
            <Collapsible
              open={expandedProcesses.has(process.processName)}
              onOpenChange={() => toggleProcess(process.processName)}
            >
              <CollapsibleTrigger asChild>
                <CardHeader className="hover:bg-muted/50 cursor-pointer transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {expandedProcesses.has(process.processName) ? 
                        <ChevronDown className="h-5 w-5" /> : 
                        <ChevronRight className="h-5 w-5" />
                      }
                      <CardTitle className="text-xl flex items-center gap-2">
                        <Factory className="h-5 w-5" />
                        PROCESO: {process.processName.toUpperCase()}
                      </CardTitle>
          <Badge variant={getOccupancyVariant(process.totalOccupancy)} className="text-sm">
            {process.totalOccupancy.toFixed(1)}% Ocupación ({formatTime(process.totalTime)} / {formatTime(process.availableHours * process.operators * 60)})
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
                    {process.machines.map((machine) => (
                      <Card key={machine.machineId} className="border-l-4 border-l-primary/20">
                        <Collapsible
                          open={expandedMachines.has(`${process.processName}-${machine.machineId}`)}
                          onOpenChange={() => toggleMachine(process.processName, machine.machineId)}
                        >
                          <CollapsibleTrigger asChild>
                            <CardHeader className="pb-3 hover:bg-muted/30 cursor-pointer transition-colors">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  {expandedMachines.has(`${process.processName}-${machine.machineId}`) ? 
                                    <ChevronDown className="h-4 w-4" /> : 
                                    <ChevronRight className="h-4 w-4" />
                                  }
                                  <CardTitle className="text-lg flex items-center gap-2">
                                    <Settings className="h-4 w-4" />
                                    Máquina {machine.machineName}
                                  </CardTitle>
                  <Badge variant={getOccupancyVariant(machine.occupancy)} className="text-xs">
                    {machine.occupancy.toFixed(1)}% - {formatTime(machine.totalTime)} / {formatTime(process.availableHours * 60)}
                  </Badge>
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  {machine.references.length} referencia{machine.references.length !== 1 ? 's' : ''}
                                </div>
                              </div>
                            </CardHeader>
                          </CollapsibleTrigger>

                          <CollapsibleContent>
                            <CardContent className="pt-0">
                              <div className="space-y-2 ml-8">
                                {machine.references.map((ref, index) => (
                                  <div
                                    key={index}
                                    className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border-l-2 border-l-secondary"
                                  >
                                    <div className="flex items-center gap-3">
                                      <div className="font-medium">Ref {ref.referencia}</div>
                                      {ref.alerta && (
                                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                                      )}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-4 text-sm">
                                      <span className="text-muted-foreground">
                                        Cant: <span className="font-medium text-foreground">{ref.cantidadRequerida}</span>
                                      </span>
                                      <span className="text-muted-foreground">
                                        SAM: <span className="font-medium text-foreground">{ref.sam}</span>
                                      </span>
                                      <span className="text-muted-foreground">
                                        Tiempo: <span className="font-medium text-foreground">{formatTime(ref.tiempoTotal)}</span>
                                      </span>
                                      <Badge variant={getOccupancyVariant(ref.ocupacionPorcentaje)} className="text-xs">
                                        {ref.ocupacionPorcentaje.toFixed(1)}%
                                      </Badge>
                                      {ref.alerta && (
                                        <span className={`text-xs ${ref.sam === 0 || ref.alerta.toLowerCase().includes('falta sam') ? 'text-destructive' : 'text-muted-foreground'}`}>
                                          {ref.alerta}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                ))}
                                
                                {machine.references.length === 0 && (
                                  <div className="text-center py-4 text-muted-foreground">
                                    Sin operario asignado - Máquina disponible
                                  </div>
                                )}
                              </div>
                            </CardContent>
                          </CollapsibleContent>
                        </Collapsible>
                      </Card>
                    ))}
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        ))}
      </div>

      {/* Botones de navegación */}
      <div className="flex gap-2">
        <Button variant="outline" onClick={onBack}>
          Volver a Configuración
        </Button>
        <Button onClick={onStartOver} className="flex-1">
          Nuevo Análisis
        </Button>
      </div>
    </div>
  );
};

export default HierarchicalCapacityView;