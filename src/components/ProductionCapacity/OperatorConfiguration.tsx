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
  hasOperator: boolean;
  status: string;
}

export interface OperatorConfig {
  machines: MachineConfig[];
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
  const [machines, setMachines] = useState<MachineConfig[]>([]);
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

        // Crear el mapa de máquinas por proceso
        const machinesByProcessMap = new Map<number, Set<number>>();
        machineProcessData?.forEach(mp => {
          if (!machinesByProcessMap.has(mp.id_process)) {
            machinesByProcessMap.set(mp.id_process, new Set());
          }
          machinesByProcessMap.get(mp.id_process)?.add(mp.id_machine);
        });

        const allMachines: MachineConfig[] = [];

        // Para cada proceso que tiene máquinas asignadas
        machinesByProcessMap.forEach((machineIds, processId) => {
          const process = processesData?.find(p => p.id === processId);
          if (!process) return;

          machineIds.forEach(machineId => {
            const machine = machinesData?.find(m => m.id === machineId);
            if (!machine) return;

            allMachines.push({
              id: machine.id,
              name: machine.name,
              processName: process.name,
              processId: processId,
              isOperational: machine.status === 'ENCENDIDO',
              hasOperator: false, // Por defecto sin operador
              status: machine.status
            });
          });
        });

        console.log('🏭 Máquinas procesadas:', allMachines.length);
        console.log('📋 Procesos encontrados:', [...new Set(allMachines.map(m => m.processName))]);

        setMachines(allMachines.sort((a, b) => 
          a.processName.localeCompare(b.processName) || a.name.localeCompare(b.name)
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

  const handleMachineConfigChange = (machineId: number, field: 'isOperational' | 'hasOperator', value: boolean) => {
    setMachines(prev => prev.map(machine => 
      machine.id === machineId 
        ? { ...machine, [field]: value }
        : machine
    ));
  };

  const handleContinue = () => {
    const config: OperatorConfig = {
      machines,
      workMonth,
      workYear,
      availableHours
    };
    onConfigComplete(config);
    onNext();
  };

  // Agrupar máquinas por proceso
  const machinesByProcess = machines.reduce((acc, machine) => {
    if (!acc[machine.processName]) {
      acc[machine.processName] = [];
    }
    acc[machine.processName].push(machine);
    return acc;
  }, {} as { [process: string]: MachineConfig[] });

  // Estadísticas
  const totalMachines = machines.length;
  const operationalMachines = machines.filter(m => m.isOperational).length;
  const machinesWithOperators = machines.filter(m => m.hasOperator).length;
  const readyMachines = machines.filter(m => m.isOperational && m.hasOperator).length;

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
              <div className="text-sm text-muted-foreground">Operativas</div>
            </div>
            <div className="text-center p-3 bg-muted rounded-lg">
              <div className="text-2xl font-bold text-blue-600">{machinesWithOperators}</div>
              <div className="text-sm text-muted-foreground">Con Operario</div>
            </div>
            <div className="text-center p-3 bg-muted rounded-lg">
              <div className="text-2xl font-bold text-primary">{readyMachines}</div>
              <div className="text-sm text-muted-foreground">Listas</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Configuración de Máquinas por Proceso */}
      <div className="space-y-4">
        {Object.entries(machinesByProcess).map(([processName, processMachines]) => (
          <Card key={processName}>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5" />
                {processName}
                <Badge variant="outline">
                  {processMachines.length} máquina{processMachines.length !== 1 ? 's' : ''}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {processMachines.map((machine) => (
                  <div key={machine.id} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="font-medium">{machine.name}</div>
                      <Badge variant={machine.status === 'ENCENDIDO' ? 'default' : 'secondary'}>
                        {machine.status}
                      </Badge>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id={`operational-${machine.id}`}
                          checked={machine.isOperational}
                          onCheckedChange={(checked) => 
                            handleMachineConfigChange(machine.id, 'isOperational', !!checked)
                          }
                        />
                        <Label htmlFor={`operational-${machine.id}`} className="text-sm">
                          Máquina operativa
                        </Label>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id={`operator-${machine.id}`}
                          checked={machine.hasOperator}
                          onCheckedChange={(checked) => 
                            handleMachineConfigChange(machine.id, 'hasOperator', !!checked)
                          }
                          disabled={!machine.isOperational}
                        />
                        <Label 
                          htmlFor={`operator-${machine.id}`} 
                          className={`text-sm ${!machine.isOperational ? 'text-muted-foreground' : ''}`}
                        >
                          Operario asignado
                        </Label>
                      </div>
                    </div>
                    
                    {machine.isOperational && machine.hasOperator && (
                      <div className="text-xs text-green-600 font-medium">
                        ✓ Lista para producir
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex gap-2">
        <Button variant="outline" onClick={onBack}>
          Volver
        </Button>
        <Button onClick={handleContinue} className="flex-1">
          Continuar a Validación de Componentes
        </Button>
      </div>
    </div>
  );
};