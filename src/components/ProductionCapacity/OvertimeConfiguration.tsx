import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
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
  efficiency: number;
}

export interface OvertimeProcessConfig {
  processName: string;
  enabled: boolean;
  machines: OvertimeMachineConfig[];
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
  selectedSundays: number;
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
  const [selectedSundays, setSelectedSundays] = useState<number>(sundaysInMonth);

  // Inicializar configuración de horas extras
  useEffect(() => {
    const groupedByProcess = new Map<string, DeficitInfo[]>();
    
    deficits.forEach(deficit => {
      if (!groupedByProcess.has(deficit.processName)) {
        groupedByProcess.set(deficit.processName, []);
      }
      groupedByProcess.get(deficit.processName)!.push(deficit);
    });

    const initialConfig: OvertimeProcessConfig[] = [];
    
    groupedByProcess.forEach((machines, processName) => {
      initialConfig.push({
        processName,
        enabled: false,
        machines: machines.map(machine => ({
          machineId: machine.machineId,
          machineName: machine.machineName,
          enabled: false,
          shifts: { shift1: false, shift2: false, shift3: false },
          currentDeficit: machine.deficitMinutes,
          additionalCapacity: 0,
          operators: machine.operators,
          efficiency: machine.efficiency
        }))
      });
    });

    setOvertimeConfig(initialConfig);
  }, [deficits]);

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
                machine.operators,
                machine.efficiency,
                selectedSundays
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

  const handleApply = () => {
    const config: OvertimeConfig = {
      processes: overtimeConfig,
      workMonth,
      workYear,
      totalSundaysInMonth: sundaysInMonth,
      selectedSundays
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
            Configure turnos extra (domingos) para los procesos y máquinas con déficit de capacidad
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Resumen Global */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Resumen de Optimización</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Selector de Domingos */}
          <div className="mb-4 p-4 border rounded-lg bg-blue-50">
            <Label className="text-sm font-medium mb-2 block">
              Seleccionar Cantidad de Domingos a Trabajar
            </Label>
            
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedSundays(Math.max(0, selectedSundays - 1))}
                  disabled={selectedSundays === 0}
                >
                  -
                </Button>
                
                <div className="text-center min-w-[100px]">
                  <div className="text-3xl font-bold text-primary">{selectedSundays}</div>
                  <div className="text-xs text-muted-foreground">domingos</div>
                </div>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedSundays(Math.min(sundaysInMonth, selectedSundays + 1))}
                  disabled={selectedSundays === sundaysInMonth}
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
            
            {selectedSundays < sundaysInMonth && (
              <div className="mt-2 text-xs text-amber-600 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                <span>Usando {selectedSundays} de {sundaysInMonth} domingos disponibles</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-3 bg-muted rounded-lg">
              <div className="flex items-center justify-center gap-1 mb-1">
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="text-2xl font-bold text-primary">{selectedSundays}</div>
              <div className="text-sm text-muted-foreground">Domingos Seleccionados</div>
            </div>
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
        {overtimeConfig.map((process) => (
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
                      {process.enabled && (
                        <Badge variant="outline" className="bg-green-50 text-green-700">
                          Activo
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>{process.machines.length} máquinas con déficit</span>
                    </div>
                  </div>
                </CardHeader>
              </CollapsibleTrigger>

              <CollapsibleContent>
                <CardContent className="pt-0">
                  <div className="space-y-3 ml-8">
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
                                <Badge variant="destructive" className="text-xs">
                                  Déficit: {formatTime(machine.currentDeficit)}
                                </Badge>
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

                                {/* Resumen de Capacidad */}
                                {machine.additionalCapacity > 0 && (
                                  <div className="p-3 bg-muted rounded-lg space-y-2">
                                    <div className="flex items-center justify-between text-sm">
                                      <span className="font-medium">Capacidad Adicional:</span>
                                      <span className="font-bold text-green-600">
                                        +{formatTime(machine.additionalCapacity)}
                                      </span>
                                    </div>
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
        ))}
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
  const date = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0).getDate();
  
  let sundays = 0;
  for (let day = 1; day <= lastDay; day++) {
    const currentDate = new Date(year, month - 1, day);
    if (currentDate.getDay() === 0) { // Domingo
      sundays++;
    }
  }
  
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
  operators: number,
  efficiency: number,
  sundaysInMonth: number
): number {
  const hoursPerSunday = calculateSundayHours(shifts);
  const totalSundayHours = hoursPerSunday * sundaysInMonth;
  
  // Convertir a minutos y aplicar operadores y eficiencia
  const additionalMinutes = totalSundayHours * 60 * operators * (efficiency / 100);
  
  return additionalMinutes;
}
