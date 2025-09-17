import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Users, Calendar, Clock, Settings, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";

export interface MachineConfig {
  id: number;
  name: string;
  processName: string;
  processId: number;
  isOperational: boolean;
  status: string;
}

export interface ProcessConfig {
  processId: number;
  processName: string;
  operatorCount: number;
  efficiency: number; // Nuevo: porcentaje de eficiencia (0-100)
  missingOperators: number; // Nuevo: operarios faltantes
  machines: MachineConfig[];
  effectivenessPercentage?: number; // Calculado: efectividad real
}

export interface OperatorConfig {
  processes: ProcessConfig[];
  workMonth: number;
  workYear: number;
  availableHours: number;
}

interface OperatorConfigurationProps {
  onNext: () => void;
  onBack: () => void;
  onConfigComplete: (config: OperatorConfig) => void;
}

export const OperatorConfiguration: React.FC<OperatorConfigurationProps> = ({
  onNext,
  onBack,
  onConfigComplete
}) => {
  const [processes, setProcesses] = useState<ProcessConfig[]>([]);
  const [workMonth, setWorkMonth] = useState(new Date().getMonth() + 1);
  const [workYear, setWorkYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Calcular horas disponibles para el mes seleccionado
  const calculateAvailableHours = (month: number, year: number): number => {
    const date = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0).getDate();
    
    let weekdays = 0;
    let saturdays = 0;
    
    for (let day = 1; day <= lastDay; day++) {
      const currentDate = new Date(year, month - 1, day);
      const dayOfWeek = currentDate.getDay();
      
      if (dayOfWeek >= 1 && dayOfWeek <= 5) { // Lunes a Viernes
        weekdays++;
      } else if (dayOfWeek === 6) { // Sábado
        saturdays++;
      }
    }
    
    // Horas brutas por turno (sin descanso)
    const weekdayHours = 8 + 8 + 8; // Mañana + Tarde + Noche (8h cada uno)
    const saturdayHours = 6.5 + 6; // Mañana + Tarde
    
    const totalBruteHours = (weekdays * weekdayHours) + (saturdays * saturdayHours);
    
    // Calcular turnos totales en el mes
    const weekdayShifts = weekdays * 3; // 3 turnos por día de semana
    const saturdayShifts = saturdays * 2; // 2 turnos por sábado
    const totalShifts = weekdayShifts + saturdayShifts;
    
    // Restar 25 minutos (0.4167 horas) de descanso por cada turno
    const totalBreakTime = totalShifts * (25/60); // 25 minutos en horas
    const netHours = totalBruteHours - totalBreakTime;
    
    return Math.round(netHours * 10) / 10; // Redondear a 1 decimal
  };

  const availableHours = calculateAvailableHours(workMonth, workYear);

  // Obtener máquinas y procesos de la base de datos
  useEffect(() => {
    const fetchMachines = async () => {
      try {
        setLoading(true);
        
        // Obtener todas las máquinas únicas primero
        const { data: machinesData, error: machinesError } = await supabase
          .from('machines')
          .select('id, name, status');

        if (machinesError) throw machinesError;

        // Obtener todos los procesos
        const { data: processesData, error: processesError } = await supabase
          .from('processes')
          .select('id, name');

        if (processesError) throw processesError;

        // Obtener la relación máquinas-procesos
        const { data: machineProcessData, error: mpError } = await supabase
          .from('machines_processes')
          .select('id_machine, id_process');

        if (mpError) throw mpError;

        console.log('📊 Datos obtenidos:', {
          machines: machinesData?.length,
          processes: processesData?.length,
          machineProcesses: machineProcessData?.length
        });

        // Mapeo de procesos a máquinas basado en la información real de producción
        const processMachineMapping: Record<string, string[]> = {
          'Corte': ['CZ-01'],
          'Troquelado': ['TQ-01', 'TQ-02', 'TQ-03', 'TQ-04', 'TQ-05', 'TQ-06', 'TQ-07', 'TQ-08', 'TQ-09', 'TQ-10', 'TQ-11'],
          'Punzonado': ['PZ-01', 'PZ-02'],
          'Doblez': ['DB-01', 'DB-02', 'DB-03', 'DB-04', 'DB-05', 'DB-06', 'RM-01'],
          'Soldadura': ['SP-01', 'SP-02', 'SP-03'],
          'Mig': ['SE-01', 'SE-02'],
          'EnsambleInt': ['MESA', 'MESA2', 'MESA3', 'MESA4', 'MESA5'],
          'Inyección': ['INY-01', 'INY-02', 'INY-03', 'INY-04', 'INY-05', 'INY-06', 'INY-07'],
          'RoscadoConectores': ['RC-01'],
          'Ensamble': [
            'EN-01A', 'EN-02A', 'EN-03A', 'EN-04A', 'EN-05A', 'EN-06A', 'EN-07A', 'EN-08A', 'EN-09A',
            'EN-01B', 'EN-02B', 'EN-03B', 'EN-04B', 'EN-05B', 'EN-06B', 'EN-07B', 'EN-08B', 'EN-09B'
          ],
          'Tapas': ['EN-10A', 'EN-10B']
        };

        // Crear configuración para TODOS los procesos usando el mapeo correcto
        const processConfigs: ProcessConfig[] = [];

        // Procesos a excluir según los requerimientos
        const excludedProcesses = ['Pulido', 'RecepcionAlm', 'RecepcionPL', 'Reclasificación', 'Remachado', 'Reproceso'];

        // Para cada proceso existente
        processesData?.forEach(process => {
          // Filtrar procesos excluidos
          if (excludedProcesses.includes(process.name)) {
            return;
          }

          const processMachines: MachineConfig[] = [];
          
          // Obtener los nombres de máquinas para este proceso
          const machineNamesForProcess = processMachineMapping[process.name] || [];
          
          // Buscar las máquinas correspondientes en la base de datos
          machineNamesForProcess.forEach(machineName => {
            const machine = machinesData?.find(m => m.name === machineName);
            if (machine) {
              processMachines.push({
                id: machine.id,
                name: machine.name,
                processName: process.name,
                processId: process.id,
                isOperational: machine.status === 'ENCENDIDO',
                status: machine.status
              });
            }
          });

          // Crear configuración para este proceso (incluso si no tiene máquinas)
          processConfigs.push({
            processId: process.id,
            processName: process.name,
            operatorCount: 1, // Por defecto 1 operario
            efficiency: 100, // Por defecto 100% de eficiencia
            missingOperators: 0, // Por defecto sin operarios faltantes
            machines: processMachines.sort((a, b) => a.name.localeCompare(b.name))
          });
        });

        console.log('🏭 Procesos configurados:', processConfigs.length);
        console.log('📋 Procesos encontrados:', processConfigs.map(p => `${p.processName} (${p.machines.length} máqs)`));
        console.log('🔧 Máquinas totales procesadas:', processConfigs.reduce((sum, p) => sum + p.machines.length, 0));

        setProcesses(processConfigs.sort((a, b) => 
          a.processName.localeCompare(b.processName)
        ));
      } catch (err) {
        console.error('Error fetching machines:', err);
        setError('Error al cargar las máquinas');
      } finally {
        setLoading(false);
      }
    };

    fetchMachines();
  }, []);

  const handleMachineConfigChange = (processId: number, machineId: number, isOperational: boolean) => {
    setProcesses(prev => prev.map(process => 
      process.processId === processId 
        ? {
            ...process,
            machines: process.machines.map(machine =>
              machine.id === machineId 
                ? { ...machine, isOperational }
                : machine
            )
          }
        : process
    ));
  };

  const handleOperatorCountChange = (processId: number, operatorCount: number) => {
    setProcesses(prev => prev.map(process => 
      process.processId === processId 
        ? { ...process, operatorCount: Math.max(0, operatorCount) }
        : process
    ));
  };

  const handleEfficiencyChange = (processId: number, efficiency: number) => {
    setProcesses(prev => prev.map(process => 
      process.processId === processId 
        ? { ...process, efficiency: Math.max(1, Math.min(100, efficiency)) }
        : process
    ));
  };

  const handleMissingOperatorsChange = (processId: number, missingOperators: number) => {
    setProcesses(prev => prev.map(process => 
      process.processId === processId 
        ? { ...process, missingOperators: Math.max(0, missingOperators) }
        : process
    ));
  };

  // Función para calcular la efectividad de un proceso
  const calculateEffectiveness = (process: ProcessConfig) => {
    const operationalMachines = process.machines.filter(m => m.isOperational).length;
    if (operationalMachines === 0) return 0;
    
    const effectiveOperators = Math.max(0, process.operatorCount - process.missingOperators);
    const utilizationRate = effectiveOperators / operationalMachines;
    const effectiveness = Math.min(utilizationRate, 1) * (process.efficiency / 100) * 100;
    
    return effectiveness;
  };

  // Función para obtener la variante de color de la alerta
  const getEffectivenessVariant = (effectiveness: number) => {
    if (effectiveness < 50) return 'destructive';
    if (effectiveness < 70) return 'secondary';
    return 'default';
  };

  // Función para obtener el ícono de alerta
  const getEffectivenessIcon = (effectiveness: number) => {
    if (effectiveness < 50) return <AlertTriangle className="h-4 w-4" />;
    if (effectiveness < 70) return <AlertTriangle className="h-4 w-4" />;
    return null;
  };

  const handleContinue = () => {
    const config: OperatorConfig = {
      processes,
      workMonth,
      workYear,
      availableHours
    };
    onConfigComplete(config);
    onNext();
  };

  // Estadísticas
  const totalMachines = processes.reduce((sum, process) => sum + process.machines.length, 0);
  const operationalMachines = processes.reduce((sum, process) => 
    sum + process.machines.filter(m => m.isOperational).length, 0);
  const totalOperators = processes.reduce((sum, process) => sum + process.operatorCount, 0);
  const effectiveCapacity = processes.reduce((sum, process) => {
    const operationalCount = process.machines.filter(m => m.isOperational).length;
    return sum + Math.min(operationalCount, process.operatorCount);
  }, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p>Cargando configuración de máquinas...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              <span>{error}</span>
            </div>
          </CardContent>
        </Card>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onBack}>
            Volver
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Configuración de Máquinas y Operarios
          </CardTitle>
          <CardDescription>
            Configure qué máquinas están operativas y cuáles cuentan con operario asignado
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Configuración de Período */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Calendar className="h-5 w-5" />
            Período de Análisis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="workMonth">Mes</Label>
              <Input
                id="workMonth"
                type="number"
                min="1"
                max="12"
                value={workMonth}
                onChange={(e) => setWorkMonth(parseInt(e.target.value) || 1)}
              />
            </div>
            <div>
              <Label htmlFor="workYear">Año</Label>
              <Input
                id="workYear"
                type="number"
                min="2023"
                max="2030"
                value={workYear}
                onChange={(e) => setWorkYear(parseInt(e.target.value) || new Date().getFullYear())}
              />
            </div>
            <div className="flex items-center justify-center p-4 bg-muted rounded-lg">
              <div className="text-center">
                <div className="flex items-center gap-2 justify-center mb-1">
                  <Clock className="h-4 w-4" />
                  <span className="text-sm font-medium">Horas Disponibles</span>
                </div>
                <div className="text-2xl font-bold text-primary">{availableHours.toFixed(1)}h</div>
                <div className="text-xs text-muted-foreground">por operario</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Resumen */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Resumen de Configuración</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-3 bg-muted rounded-lg">
              <div className="text-2xl font-bold">{totalMachines}</div>
              <div className="text-sm text-muted-foreground">Total Máquinas</div>
            </div>
            <div className="text-center p-3 bg-muted rounded-lg">
              <div className="text-2xl font-bold text-green-600">{operationalMachines}</div>
              <div className="text-sm text-muted-foreground">Máq. Operativas</div>
            </div>
            <div className="text-center p-3 bg-muted rounded-lg">
              <div className="text-2xl font-bold text-blue-600">{totalOperators}</div>
              <div className="text-sm text-muted-foreground">Total Operarios</div>
            </div>
            <div className="text-center p-3 bg-muted rounded-lg">
              <div className="text-2xl font-bold text-primary">{effectiveCapacity}</div>
              <div className="text-sm text-muted-foreground">Capacidad Real</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Configuración de Procesos y Máquinas */}
      <div className="space-y-4">
        {processes.map((process) => {
          const operationalCount = process.machines.filter(m => m.isOperational).length;
          const effectiveStations = Math.min(operationalCount, process.operatorCount);
          const capacityMinutes = effectiveStations * availableHours * 60 * (process.efficiency / 100);
          const effectiveness = calculateEffectiveness(process);
          
          return (
            <Card key={process.processId}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    {process.processName}
                    <Badge variant="outline">
                      {process.machines.length} máquina{process.machines.length !== 1 ? 's' : ''}
                    </Badge>
                    <Badge variant={getEffectivenessVariant(effectiveness)} className="flex items-center gap-1">
                      {getEffectivenessIcon(effectiveness)}
                      {effectiveness.toFixed(1)}% Efectividad
                    </Badge>
                  </CardTitle>
                </div>
                
                {/* Controles de configuración */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor={`operators-${process.processId}`} className="text-sm font-medium">
                      Operarios Asignados
                    </Label>
                    <Input
                      id={`operators-${process.processId}`}
                      type="number"
                      min="0"
                      max={process.machines.length}
                      value={process.operatorCount}
                      onChange={(e) => handleOperatorCountChange(process.processId, parseInt(e.target.value) || 0)}
                      className="text-center"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`efficiency-${process.processId}`} className="text-sm font-medium">
                      Eficiencia (%)
                    </Label>
                    <Input
                      id={`efficiency-${process.processId}`}
                      type="number"
                      min="1"
                      max="100"
                      value={process.efficiency}
                      onChange={(e) => handleEfficiencyChange(process.processId, parseInt(e.target.value) || 80)}
                      className="text-center"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`missing-${process.processId}`} className="text-sm font-medium">
                      Operarios Faltantes
                    </Label>
                    <Input
                      id={`missing-${process.processId}`}
                      type="number"
                      min="0"
                      max={process.operatorCount}
                      value={process.missingOperators}
                      onChange={(e) => handleMissingOperatorsChange(process.processId, parseInt(e.target.value) || 0)}
                      className="text-center"
                    />
                  </div>

                  <div className="flex items-center justify-center p-2 bg-muted/50 rounded">
                    <div className="text-center">
                      <div className="text-lg font-bold">{(capacityMinutes/60).toFixed(1)}h</div>
                      <div className="text-xs text-muted-foreground">Capacidad Total</div>
                    </div>
                  </div>
                </div>

                {/* Métricas del proceso */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                  <div className="text-center p-2 bg-muted/50 rounded">
                    <div className="text-lg font-bold text-green-600">{operationalCount}</div>
                    <div className="text-xs text-muted-foreground">Máq. Operativas</div>
                  </div>
                  <div className="text-center p-2 bg-muted/50 rounded">
                    <div className="text-lg font-bold text-blue-600">{Math.max(0, process.operatorCount - process.missingOperators)}</div>
                    <div className="text-xs text-muted-foreground">Operarios Efectivos</div>
                  </div>
                  <div className="text-center p-2 bg-muted/50 rounded">
                    <div className="text-lg font-bold text-primary">{effectiveStations}</div>
                    <div className="text-xs text-muted-foreground">Estaciones Activas</div>
                  </div>
                  <div className="text-center p-2 bg-muted/50 rounded">
                    <div className={`text-lg font-bold ${effectiveness < 50 ? 'text-red-600' : effectiveness < 70 ? 'text-yellow-600' : 'text-green-600'}`}>
                      {effectiveness.toFixed(1)}%
                    </div>
                    <div className="text-xs text-muted-foreground">Efectividad Real</div>
                  </div>
                </div>

                {/* Alertas de proceso */}
                {(effectiveness < 50 || operationalCount !== process.operatorCount) && (
                  <div className="mt-2 space-y-1">
                    {effectiveness < 50 && (
                      <div className="text-sm text-red-600 flex items-center gap-1">
                        <AlertTriangle className="h-4 w-4" />
                        ⚠️ Efectividad crítica - Se requiere atención urgente
                      </div>
                    )}
                    {operationalCount > process.operatorCount && (
                      <div className="text-sm text-amber-600 flex items-center gap-1">
                        <AlertTriangle className="h-4 w-4" />
                        {operationalCount - process.operatorCount} máquina(s) sin operario asignado
                      </div>
                    )}
                    {process.operatorCount > operationalCount && (
                      <div className="text-sm text-blue-600 flex items-center gap-1">
                        <Users className="h-4 w-4" />
                        {process.operatorCount - operationalCount} operario(s) adicional(es) disponible(s)
                      </div>
                    )}
                    {process.missingOperators > 0 && (
                      <div className="text-sm text-orange-600 flex items-center gap-1">
                        <AlertTriangle className="h-4 w-4" />
                        {process.missingOperators} operario(s) faltante(s) - Reduce la capacidad efectiva
                      </div>
                    )}
                  </div>
                )}
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {process.machines.map((machine) => (
                    <div key={machine.id} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="font-medium">{machine.name}</div>
                        <Badge variant={machine.status === 'ENCENDIDO' ? 'default' : 'secondary'}>
                          {machine.status}
                        </Badge>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id={`operational-${machine.id}`}
                          checked={machine.isOperational}
                          onCheckedChange={(checked) => 
                            handleMachineConfigChange(process.processId, machine.id, !!checked)
                          }
                        />
                        <Label htmlFor={`operational-${machine.id}`} className="text-sm">
                          Máquina disponible para producción
                        </Label>
                      </div>
                      
                      {machine.isOperational && (
                        <div className="text-xs text-green-600 font-medium">
                          ✓ Disponible
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex gap-2">
        <Button variant="outline" onClick={onBack}>
          Volver
        </Button>
        <Button onClick={handleContinue} className="flex-1">
          Continuar a Capacidad por Proceso
        </Button>
      </div>
    </div>
  );
};