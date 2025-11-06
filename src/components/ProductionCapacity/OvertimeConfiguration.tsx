import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Clock, Calendar, AlertCircle, CheckCircle2, Settings } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight } from "lucide-react";

export interface OvertimeShift {
  shift1: boolean; // Turno mañana 5:25am - 1:00pm
  shift2: boolean; // Turno tarde 1:00pm - 8:37pm
  shift3: boolean; // Turno noche 8:37pm - 5:25am
}

export interface OvertimeMachineConfig {
  machineId: string;
  machineName: string;
  enabled: boolean;
  shifts: OvertimeShift;
  currentDeficit: number; // minutos de déficit actual
  additionalCapacity: number; // minutos que se agregarían
  operators: number;
  selectedOperators: number; // operarios que trabajarán en horas extras
  efficiency: number;
}

export interface OvertimeProcessConfig {
  processName: string;
  enabled: boolean;
  machines: OvertimeMachineConfig[];
  selectedSundays: number; // Domingos seleccionados para este proceso específico
}

export interface DeficitInfo {
  processName: string;
  machineName: string;
  machineId: string;
  deficitMinutes: number;
  deficitPercentage: number;
  currentOccupancy: number;
  operators: number;
  efficiency: number;
}

export interface OvertimeConfig {
  processes: OvertimeProcessConfig[];
  workMonth: number;
  workYear: number;
  totalSundaysInMonth: number;
}

interface OvertimeConfigurationProps {
  deficits: DeficitInfo[];
  workMonth: number;
  workYear: number;
  onBack: () => void;
  onApply: (config: OvertimeConfig) => void;
}

export const OvertimeConfiguration: React.FC<OvertimeConfigurationProps> = ({
  deficits,
  workMonth,
  workYear,
  onBack,
  onApply
}) => {
  const [expandedProcesses, setExpandedProcesses] = useState<Set<string>>(new Set());
  const [overtimeConfig, setOvertimeConfig] = useState<OvertimeProcessConfig[]>([]);
  const sundaysInMonth = calculateSundaysInMonth(workMonth, workYear);

  // Inicializar configuración de horas extras - INCLUYE TODOS LOS PROCESOS
  useEffect(() => {
    console.log(`🔧 [INIT OVERTIME] Inicializando configuración`, {
      workMonth,
      workYear,
      sundaysInMonth,
      deficitsCount: deficits.length
    });
    
    const groupedByProcess = new Map<string, DeficitInfo[]>();
    
    deficits.forEach(deficit => {
      if (!groupedByProcess.has(deficit.processName)) {
        groupedByProcess.set(deficit.processName, []);
      }
      groupedByProcess.get(deficit.processName)!.push(deficit);
    });

    const initialConfig: OvertimeProcessConfig[] = [];
    
    groupedByProcess.forEach((machines, processName) => {
      // Calcular si tiene déficit crítico
      const hasCriticalDeficit = machines.some(m => m.currentOccupancy > 100);
      const hasModerateDeficit = machines.some(m => m.currentOccupancy > 80);
      
      console.log(`📦 [INIT OVERTIME] Configurando proceso: ${processName} con ${sundaysInMonth} domingos (Crítico: ${hasCriticalDeficit}, Moderado: ${hasModerateDeficit})`);
      
      initialConfig.push({
        processName,
        enabled: false,
        selectedSundays: sundaysInMonth,
        machines: machines.map(machine => ({
          machineId: machine.machineId,
          machineName: machine.machineName,
          enabled: false,
          shifts: { shift1: false, shift2: false, shift3: false },
          currentDeficit: machine.deficitMinutes,
          additionalCapacity: 0,
          operators: machine.operators,
          selectedOperators: machine.operators, // Inicializar con todos los operarios
          efficiency: machine.efficiency
        }))
      });
    });

    console.log(`✅ [INIT OVERTIME] Configuración inicial completada:`, initialConfig);
    setOvertimeConfig(initialConfig);
  }, [deficits, sundaysInMonth]);

  const toggleProcess = (processName: string) => {
    const newExpanded = new Set(expandedProcesses);
    if (newExpanded.has(processName)) {
      newExpanded.delete(processName);
    } else {
      newExpanded.add(processName);
    }
    setExpandedProcesses(newExpanded);
  };

  const handleProcessToggle = (processName: string, enabled: boolean) => {
    setOvertimeConfig(prev => prev.map(process => {
      if (process.processName === processName) {
        return {
          ...process,
          enabled,
          machines: process.machines.map(machine => ({
            ...machine,
            enabled: enabled ? machine.enabled : false
          }))
        };
      }
      return process;
    }));
  };

  const handleMachineToggle = (processName: string, machineId: string, enabled: boolean) => {
    setOvertimeConfig(prev => prev.map(process => {
      if (process.processName === processName) {
        return {
          ...process,
          machines: process.machines.map(machine => {
            if (machine.machineId === machineId) {
              return { ...machine, enabled };
            }
            return machine;
          })
        };
      }
      return process;
    }));
  };

  const handleShiftToggle = (processName: string, machineId: string, shift: keyof OvertimeShift) => {
    setOvertimeConfig(prev => prev.map(process => {
      if (process.processName === processName) {
        return {
          ...process,
          machines: process.machines.map(machine => {
            if (machine.machineId === machineId) {
              const newShifts = { ...machine.shifts, [shift]: !machine.shifts[shift] };
              const additionalCapacity = calculateAdditionalCapacity(
                newShifts,
                machine.selectedOperators, // Usar operarios seleccionados
                machine.efficiency,
                process.selectedSundays // Usar domingos del proceso específico
              );
              return { ...machine, shifts: newShifts, additionalCapacity };
            }
            return machine;
          })
        };
      }
      return process;
    }));
  };

  const handleProcessSundaysChange = (processName: string, newSundays: number) => {
    setOvertimeConfig(prev => prev.map(process => {
      if (process.processName === processName) {
        return {
          ...process,
          selectedSundays: newSundays,
          machines: process.machines.map(machine => {
            // Recalcular capacidad adicional con los nuevos domingos
            const additionalCapacity = calculateAdditionalCapacity(
              machine.shifts,
              machine.selectedOperators, // Usar operarios seleccionados
              machine.efficiency,
              newSundays
            );
            return { ...machine, additionalCapacity };
          })
        };
      }
      return process;
    }));
  };

  const handleOperatorsChange = (processName: string, machineId: string, newOperators: number) => {
    setOvertimeConfig(prev => prev.map(process => {
      if (process.processName === processName) {
        return {
          ...process,
          machines: process.machines.map(machine => {
            if (machine.machineId === machineId) {
              // Recalcular capacidad adicional con los nuevos operarios
              const additionalCapacity = calculateAdditionalCapacity(
                machine.shifts,
                newOperators,
                machine.efficiency,
                process.selectedSundays
              );
              return { ...machine, selectedOperators: newOperators, additionalCapacity };
            }
            return machine;
          })
        };
      }
      return process;
    }));
  };

  const handleApply = () => {
    const config: OvertimeConfig = {
      processes: overtimeConfig,
      workMonth,
      workYear,
      totalSundaysInMonth: sundaysInMonth
    };
    onApply(config);
  };

  const formatTime = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const getCoverageVariant = (deficit: number, additional: number) => {
    if (additional === 0) return 'secondary';
    const coverage = (additional / deficit) * 100;
    if (coverage >= 100) return 'default';
    if (coverage >= 70) return 'secondary';
    return 'destructive';
  };

  const getCoveragePercentage = (deficit: number, additional: number) => {
    if (additional === 0 || deficit === 0) return 0;
    return Math.min(100, (additional / deficit) * 100);
  };

  const totalDeficit = overtimeConfig.reduce((sum, process) => 
    sum + process.machines.reduce((mSum, machine) => mSum + machine.currentDeficit, 0), 0);
  
  const totalAdditionalCapacity = overtimeConfig.reduce((sum, process) => 
    sum + process.machines.filter(m => m.enabled).reduce((mSum, machine) => mSum + machine.additionalCapacity, 0), 0);

  const enabledMachinesCount = overtimeConfig.reduce((sum, process) => 
    sum + process.machines.filter(m => m.enabled).length, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-6 w-6" />
            Configuración de Horas Extras
          </CardTitle>
          <CardDescription>
            Configure turnos extra (domingos) para optimizar la capacidad de producción. 
            Los procesos con déficit crítico se muestran primero, pero puede configurar horas extras en cualquier proceso.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Resumen Global */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Resumen de Optimización</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-3 bg-muted rounded-lg">
              <div className="text-2xl font-bold text-destructive">{formatTime(totalDeficit)}</div>
              <div className="text-sm text-muted-foreground">Déficit Total</div>
            </div>
            <div className="text-center p-3 bg-muted rounded-lg">
              <div className="text-2xl font-bold text-green-600">{formatTime(totalAdditionalCapacity)}</div>
              <div className="text-sm text-muted-foreground">Capacidad Extra</div>
            </div>
            <div className="text-center p-3 bg-muted rounded-lg">
              <div className="text-2xl font-bold text-blue-600">{enabledMachinesCount}</div>
              <div className="text-sm text-muted-foreground">Máquinas con Extras</div>
            </div>
          </div>
          
          {totalAdditionalCapacity > 0 && (
            <div className="mt-4 p-3 bg-muted rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Cobertura del Déficit</span>
                <span className="text-sm font-bold">
                  {getCoveragePercentage(totalDeficit, totalAdditionalCapacity).toFixed(1)}%
                </span>
              </div>
              <Progress 
                value={getCoveragePercentage(totalDeficit, totalAdditionalCapacity)} 
                className="h-2"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Configuración por Proceso */}
      <div className="space-y-4">
        {overtimeConfig
          .sort((a, b) => {
            // Ordenar por urgencia: Crítico > Con Déficit > Sin Déficit
            const getCriticalityScore = (process: OvertimeProcessConfig) => {
              const hasCritical = process.machines.some(m => m.currentDeficit > 0 && (m.currentDeficit / (m.operators * 160)) > 0.2);
              const hasDeficit = process.machines.some(m => m.currentDeficit > 0);
              
              if (hasCritical) return 3;
              if (hasDeficit) return 2;
              return 1;
            };
            
            return getCriticalityScore(b) - getCriticalityScore(a);
          })
          .map((process) => {
          // Calcular nivel de urgencia del proceso
          const hasCriticalDeficit = process.machines.some(m => m.currentDeficit > 0 && (m.currentDeficit / (m.operators * 160)) > 0.2); // >20% de déficit
          const hasDeficit = process.machines.some(m => m.currentDeficit > 0);
          
          const urgencyBadge = hasCriticalDeficit ? (
            <Badge variant="destructive" className="text-xs">
              🔴 Déficit Crítico
            </Badge>
          ) : hasDeficit ? (
            <Badge variant="secondary" className="text-xs">
              🟡 Capacidad Ajustada
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs bg-green-50 text-green-700">
              🟢 Capacidad Disponible
            </Badge>
          );
          
          return (
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
                        <div className="flex items-center gap-3">
                          <Switch
                            checked={process.enabled}
                            onCheckedChange={(checked) => {
                              handleProcessToggle(process.processName, checked);
                            }}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <CardTitle className="text-lg">{process.processName}</CardTitle>
                        </div>
                        {urgencyBadge}
                        {process.enabled && (
                          <Badge variant="outline" className="bg-green-50 text-green-700">
                            Activo
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>{process.machines.length} máquina{process.machines.length !== 1 ? 's' : ''}</span>
                      </div>
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>

              <CollapsibleContent>
                <CardContent className="pt-0">
                  <div className="space-y-4 ml-8">
                    {/* Selector de Domingos por Proceso */}
                    <div className="p-4 border rounded-lg bg-blue-50">
                      <Label className="text-sm font-medium mb-2 block">
                        Domingos a Trabajar en {process.processName}
                      </Label>
                      
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleProcessSundaysChange(process.processName, Math.max(0, process.selectedSundays - 1))}
                            disabled={process.selectedSundays === 0 || !process.enabled}
                          >
                            -
                          </Button>
                          
                          <div className="text-center min-w-[80px]">
                            <div className="text-2xl font-bold text-primary">{process.selectedSundays}</div>
                            <div className="text-xs text-muted-foreground">domingos</div>
                          </div>
                          
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleProcessSundaysChange(process.processName, Math.min(sundaysInMonth, process.selectedSundays + 1))}
                            disabled={process.selectedSundays === sundaysInMonth || !process.enabled}
                          >
                            +
                          </Button>
                        </div>
                        
                        <Separator orientation="vertical" className="h-12" />
                        
                        <div className="flex-1">
                          <div className="text-sm text-muted-foreground mb-1">
                            Domingos disponibles en {getMonthName(workMonth)} {workYear}
                          </div>
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-primary" />
                            <span className="font-semibold">{sundaysInMonth} domingos</span>
                          </div>
                        </div>
                      </div>
                      
                      {process.selectedSundays < sundaysInMonth && (
                        <div className="mt-2 text-xs text-amber-600 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          <span>Usando {process.selectedSundays} de {sundaysInMonth} domingos disponibles</span>
                        </div>
                      )}
                    </div>

                    {process.machines.map((machine) => (
                      <Card key={machine.machineId} className="border-l-4 border-l-amber-500">
                        <CardHeader className="pb-3">
                          <div className="space-y-4">
                            {/* Encabezado de Máquina */}
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <Switch
                                  checked={machine.enabled}
                                  onCheckedChange={(checked) => {
                                    handleMachineToggle(process.processName, machine.machineId, checked);
                                  }}
                                  disabled={!process.enabled}
                                />
                                <Settings className="h-4 w-4 text-muted-foreground" />
                                <span className="font-semibold">{machine.machineName}</span>
                                 {machine.currentDeficit > 0 ? (
                                   <Badge variant="destructive" className="text-xs">
                                     Déficit: {formatTime(machine.currentDeficit)}
                                   </Badge>
                                 ) : (
                                   <Badge variant="outline" className="text-xs bg-green-50 text-green-700">
                                     Sin Déficit
                                   </Badge>
                                 )}
                              </div>
                            </div>

                            {/* Configuración de Turnos */}
                            {machine.enabled && (
                              <div className="space-y-3 pl-8">
                                <Label className="text-sm font-medium">Seleccionar Turnos Extra (Domingos)</Label>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                  {/* Turno 1 */}
                                  <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-muted/50">
                                    <Checkbox
                                      id={`${machine.machineId}-shift1`}
                                      checked={machine.shifts.shift1}
                                      onCheckedChange={() => handleShiftToggle(process.processName, machine.machineId, 'shift1')}
                                    />
                                    <Label 
                                      htmlFor={`${machine.machineId}-shift1`}
                                      className="flex-1 cursor-pointer"
                                    >
                                      <div className="font-medium">Turno 1 - Mañana</div>
                                      <div className="text-xs text-muted-foreground">5:25am - 1:00pm</div>
                                      <div className="text-xs font-semibold text-primary">7.17h netas</div>
                                    </Label>
                                  </div>

                                  {/* Turno 2 */}
                                  <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-muted/50">
                                    <Checkbox
                                      id={`${machine.machineId}-shift2`}
                                      checked={machine.shifts.shift2}
                                      onCheckedChange={() => handleShiftToggle(process.processName, machine.machineId, 'shift2')}
                                    />
                                    <Label 
                                      htmlFor={`${machine.machineId}-shift2`}
                                      className="flex-1 cursor-pointer"
                                    >
                                      <div className="font-medium">Turno 2 - Tarde</div>
                                      <div className="text-xs text-muted-foreground">1:00pm - 8:37pm</div>
                                      <div className="text-xs font-semibold text-primary">7.20h netas</div>
                                    </Label>
                                  </div>

                                  {/* Turno 3 */}
                                  <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-muted/50">
                                    <Checkbox
                                      id={`${machine.machineId}-shift3`}
                                      checked={machine.shifts.shift3}
                                      onCheckedChange={() => handleShiftToggle(process.processName, machine.machineId, 'shift3')}
                                    />
                                    <Label 
                                      htmlFor={`${machine.machineId}-shift3`}
                                      className="flex-1 cursor-pointer"
                                    >
                                      <div className="font-medium">Turno 3 - Noche</div>
                                      <div className="text-xs text-muted-foreground">8:37pm - 5:25am</div>
                                      <div className="text-xs font-semibold text-primary">8.38h netas</div>
                                    </Label>
                                  </div>
                                </div>

                                {/* Selección de Operarios para Horas Extras */}
                                <div className="mt-4 p-3 border rounded-lg bg-blue-50/50">
                                  <Label className="text-sm font-medium mb-2 block">
                                    Operarios que trabajarán en horas extras
                                  </Label>
                                  <div className="flex items-center gap-3">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleOperatorsChange(process.processName, machine.machineId, Math.max(1, machine.selectedOperators - 1))}
                                      disabled={machine.selectedOperators <= 1}
                                    >
                                      -
                                    </Button>
                                    <Input
                                      type="number"
                                      min="1"
                                      value={machine.selectedOperators}
                                      onChange={(e) => {
                                        const value = parseInt(e.target.value) || 1;
                                        const clampedValue = Math.max(1, value);
                                        handleOperatorsChange(process.processName, machine.machineId, clampedValue);
                                      }}
                                      className="w-20 text-center"
                                    />
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleOperatorsChange(process.processName, machine.machineId, machine.selectedOperators + 1)}
                                    >
                                      +
                                    </Button>
                                    <div className="text-xs text-muted-foreground ml-2">
                                      Operarios base: {machine.operators}
                                    </div>
                                  </div>
                                </div>

                                {/* Resumen de Capacidad */}
                                {(machine.shifts.shift1 || machine.shifts.shift2 || machine.shifts.shift3) && (
                                  <div className="p-3 bg-muted rounded-lg space-y-2">
                                    <div className="flex items-center justify-between text-sm">
                                      <span className="font-medium">Horas extras por operario:</span>
                                      <span className="font-bold text-blue-600">
                                        {formatTime(calculateSundayHours(machine.shifts) * process.selectedSundays * 60)}
                                      </span>
                                    </div>
                                     <div className="text-xs text-muted-foreground text-center">
                                       {formatTime(calculateSundayHours(machine.shifts) * 60)} por domingo × {process.selectedSundays} {process.selectedSundays === 1 ? 'domingo' : 'domingos'}
                                     </div>
                                     
                                     {/* Extensión de sábados */}
                                     {process.selectedSundays > 0 && (
                                       <>
                                         <Separator className="my-2" />
                                         <div className="flex items-center justify-between text-sm">
                                           <span className="font-medium">Extensión de sábados:</span>
                                           <span className="font-bold text-purple-600">
                                             {formatTime((22.75 - 11.9) * process.selectedSundays * 60)}
                                           </span>
                                         </div>
                                         <div className="text-xs text-muted-foreground text-center">
                                           {formatTime((22.75 - 11.9) * 60)} por sábado × {process.selectedSundays} sábado{process.selectedSundays !== 1 ? 's' : ''}
                                         </div>
                                         <div className="text-xs text-muted-foreground text-center italic">
                                           Cuando se trabaja domingo, el sábado anterior tiene 3 turnos completos
                                         </div>
                                       </>
                                     )}
                                     
                                     <Separator className="my-2" />
                                     <div className="flex items-center justify-between text-sm">
                                       <span className="font-medium">Capacidad adicional total:</span>
                                       <span className="font-bold text-green-600">
                                         +{formatTime(machine.additionalCapacity)}
                                       </span>
                                     </div>
                                    <div className="text-xs text-muted-foreground text-center">
                                      ({machine.selectedOperators} operarios × {machine.efficiency}% eficiencia)
                                    </div>
                                    {machine.additionalCapacity > 0 && (
                                      <>
                                        <Separator className="my-2" />
                                        <div className="flex items-center justify-between text-sm">
                                          <span className="font-medium">Cobertura del Déficit:</span>
                                          <span className="font-bold">
                                            {getCoveragePercentage(machine.currentDeficit, machine.additionalCapacity).toFixed(1)}%
                                          </span>
                                        </div>
                                        <Progress 
                                          value={getCoveragePercentage(machine.currentDeficit, machine.additionalCapacity)} 
                                          className="h-2"
                                        />
                                        {getCoveragePercentage(machine.currentDeficit, machine.additionalCapacity) >= 100 ? (
                                          <div className="flex items-center gap-2 text-sm text-green-600">
                                            <CheckCircle2 className="h-4 w-4" />
                                            <span className="font-medium">Déficit cubierto completamente</span>
                                          </div>
                                        ) : (
                                          <div className="flex items-center gap-2 text-sm text-amber-600">
                                            <AlertCircle className="h-4 w-4" />
                                            <span className="font-medium">
                                              Déficit cubierto parcialmente ({getCoveragePercentage(machine.currentDeficit, machine.additionalCapacity).toFixed(0)}%)
                                            </span>
                                          </div>
                                        )}
                                      </>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </CardHeader>
                      </Card>
                    ))}
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>
          );
        })}
      </div>

      {/* Información de Domingos por Mes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Información de Domingos por Mes ({workYear})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2 text-xs">
            {Array.from({ length: 12 }, (_, i) => {
              const month = i + 1;
              const sundays = calculateSundaysInMonth(month, workYear);
              const isCurrentMonth = month === workMonth;
              
              return (
                <div 
                  key={month}
                  className={`p-2 rounded border text-center ${
                    isCurrentMonth 
                      ? 'bg-primary text-primary-foreground border-primary font-semibold' 
                      : 'bg-muted'
                  }`}
                >
                  <div className="font-medium">{getMonthName(month).substring(0, 3)}</div>
                  <div className="text-lg font-bold">{sundays}</div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Botones de Acción */}
      <div className="flex gap-2">
        <Button variant="outline" onClick={onBack}>
          Volver
        </Button>
        <Button 
          onClick={handleApply} 
          className="flex-1"
          disabled={enabledMachinesCount === 0}
        >
          Aplicar Horas Extras
        </Button>
      </div>
    </div>
  );
};

// Utilidades
function getMonthName(month: number): string {
  const months = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  return months[month - 1];
}

function calculateSundaysInMonth(month: number, year: number): number {
  console.log(`🔍 [SUNDAYS CALC] Calculando domingos para mes: ${month}, año: ${year}`);
  
  const lastDay = new Date(year, month, 0).getDate();
  console.log(`📅 [SUNDAYS CALC] Último día del mes: ${lastDay}`);
  
  let sundays = 0;
  const sundayDates: number[] = [];
  
  for (let day = 1; day <= lastDay; day++) {
    const currentDate = new Date(year, month - 1, day);
    if (currentDate.getDay() === 0) { // Domingo
      sundays++;
      sundayDates.push(day);
    }
  }
  
  console.log(`✅ [SUNDAYS CALC] Total domingos encontrados: ${sundays}`, sundayDates);
  
  return sundays;
}

function calculateSundayHours(shifts: OvertimeShift): number {
  let totalHours = 0;
  
  // Domingos trabajan igual que días de semana (sin reducción de sábado)
  if (shifts.shift1) totalHours += 7.17; // Turno 1 neto
  if (shifts.shift2) totalHours += 7.20; // Turno 2 neto
  if (shifts.shift3) totalHours += 8.38; // Turno 3 neto
  
  return totalHours;
}

function calculateAdditionalCapacity(
  shifts: OvertimeShift,
  selectedOperators: number,
  efficiency: number,
  sundaysInMonth: number
): number {
  let totalExtraHours = 0;
  
  // 1. Horas de domingos
  const sundayHours = calculateSundayHours(shifts);
  const totalSundayHours = sundayHours * sundaysInMonth;
  
  // 2. Horas adicionales de sábados (cuando se trabaja domingo)
  let saturdayExtensionHours = 0;
  if (sundaysInMonth > 0) {
    // Por cada domingo trabajado, el sábado anterior se extiende
    // Diferencia entre sábado normal (2 turnos reducidos) y sábado extendido (3 turnos completos)
    const normalSaturdayHours = 6.0834 + 5.917; // 11.9004 horas (2 turnos reducidos)
    const extendedSaturdayHours = 7.17 + 7.20 + 8.38; // 22.75 horas (3 turnos completos)
    const extraSaturdayHoursPerWeekend = extendedSaturdayHours - normalSaturdayHours; // ~10.85 horas
    
    saturdayExtensionHours = extraSaturdayHoursPerWeekend * sundaysInMonth;
    
    console.log(`📅 [SATURDAY EXTENSION] ${sundaysInMonth} domingos → ${sundaysInMonth} sábados extendidos`);
    console.log(`   Horas extra por sábado: ${extraSaturdayHoursPerWeekend.toFixed(2)}h`);
    console.log(`   Total extensión sábados: ${saturdayExtensionHours.toFixed(2)}h`);
  }
  
  totalExtraHours = totalSundayHours + saturdayExtensionHours;
  
  console.log(`💡 [ADDITIONAL CAPACITY]`, {
    shifts,
    sundayHoursPerDay: sundayHours.toFixed(2),
    sundaysInMonth,
    totalSundayHours: totalSundayHours.toFixed(2),
    saturdayExtensionHours: saturdayExtensionHours.toFixed(2),
    totalExtraHours: totalExtraHours.toFixed(2),
    selectedOperators,
    efficiency,
  });
  
  // Convertir a minutos y aplicar operadores y eficiencia
  const additionalMinutes = totalExtraHours * 60 * selectedOperators * (efficiency / 100);
  
  console.log(`✅ [ADDITIONAL CAPACITY] Resultado: ${additionalMinutes.toFixed(2)} minutos (${(additionalMinutes/60).toFixed(2)}h)`);
  
  return additionalMinutes;
}
