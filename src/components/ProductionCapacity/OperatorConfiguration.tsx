import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Users, Calendar as CalendarIcon, Clock, Settings, AlertTriangle, Database, CalendarRange } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ReferenceManager } from "./ReferenceManager";
import { getColombianHolidays, isColombianHoliday, formatHolidayDate } from "@/lib/colombianHolidays";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, eachDayOfInterval } from "date-fns";
import { es } from "date-fns/locale";
import { DateRange } from "react-day-picker";

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
  machines: MachineConfig[];
  effectivenessPercentage?: number; // Calculado: efectividad real
  availableHours?: number; // Horas disponibles específicas por proceso
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
  const [isReferenceManagerOpen, setIsReferenceManagerOpen] = useState(false);
  
  // Estados para selector de rango de fechas
  const [dateRangeMode, setDateRangeMode] = useState<'monthly' | 'custom'>('monthly');
  const [customDateRange, setCustomDateRange] = useState<DateRange | undefined>();
  const [workingDays, setWorkingDays] = useState<number>(0);
  const [customAvailableHours, setCustomAvailableHours] = useState<number>(0);
  const [calendarPopoverOpen, setCalendarPopoverOpen] = useState(false);

  // Calcular horas disponibles para el mes seleccionado (3 turnos - estándar)
  const calculateAvailableHours = (month: number, year: number): number => {
    const date = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0).getDate();
    
    // Obtener todos los festivos del año
    const holidays = getColombianHolidays(year);
    
    let weekdays = 0;
    let saturdays = 0;
    
    for (let day = 1; day <= lastDay; day++) {
      const currentDate = new Date(year, month - 1, day);
      const dayOfWeek = currentDate.getDay();
      
      // Verificar si es festivo
      const isFestivo = isColombianHoliday(currentDate, holidays);
      
      // Si es festivo, no contarlo como día laboral
      if (isFestivo) {
        console.log(`🎉 Día festivo detectado: ${currentDate.toLocaleDateString('es-CO')}`);
        continue;
      }
      
      if (dayOfWeek >= 1 && dayOfWeek <= 5) { // Lunes a Viernes
        weekdays++;
      } else if (dayOfWeek === 6) { // Sábado
        saturdays++;
      }
    }
    
    console.log(`📅 ${month}/${year} - Días laborales: ${weekdays} entre semana, ${saturdays} sábados (festivos excluidos)`);
    
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

  // Calcular horas disponibles para procesos de 2 turnos (Inyección y RoscadoConectores)
  const calculateAvailableHours2Shifts = (month: number, year: number): number => {
    const date = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0).getDate();
    
    // Obtener todos los festivos del año
    const holidays = getColombianHolidays(year);
    
    let weekdays = 0;
    let saturdays = 0;
    
    for (let day = 1; day <= lastDay; day++) {
      const currentDate = new Date(year, month - 1, day);
      const dayOfWeek = currentDate.getDay();
      
      // Verificar si es festivo
      const isFestivo = isColombianHoliday(currentDate, holidays);
      
      // Si es festivo, no contarlo como día laboral
      if (isFestivo) {
        continue;
      }
      
      if (dayOfWeek >= 1 && dayOfWeek <= 5) { // Lunes a Viernes
        weekdays++;
      } else if (dayOfWeek === 6) { // Sábado
        saturdays++;
      }
    }
    
    // Horas brutas por turno para días de semana (sin descanso)
    const weekdayMorningHours = 7.584; // 5:25am - 1:00pm
    const weekdayAfternoonHours = 7.617; // 1:00pm - 8:37pm
    const weekdayTotalBrute = weekdayMorningHours + weekdayAfternoonHours; // 15.201 horas
    
    // Horas brutas por turno para sábado (sin descanso)
    const saturdayMorningHours = 6.0834; // 5:25am - 11:30am
    const saturdayAfternoonHours = 5.917; // 11:30am - 5:25pm
    const saturdayTotalBrute = saturdayMorningHours + saturdayAfternoonHours; // 12.0004 horas
    
    // Calcular horas brutas totales
    const totalBruteHours = (weekdays * weekdayTotalBrute) + (saturdays * saturdayTotalBrute);
    
    // Calcular turnos totales en el mes
    const weekdayShifts = weekdays * 2; // 2 turnos por día de semana
    const saturdayShifts = saturdays * 2; // 2 turnos por sábado
    const totalShifts = weekdayShifts + saturdayShifts;
    
    // Restar 25 minutos (0.4167 horas) de descanso por cada turno
    const totalBreakTime = totalShifts * (25/60); // 25 minutos en horas
    const netHours = totalBruteHours - totalBreakTime;
    
    return Math.round(netHours * 10) / 10; // Redondear a 1 decimal
  };

  const availableHours = calculateAvailableHours(workMonth, workYear);
  const availableHours2Shifts = calculateAvailableHours2Shifts(workMonth, workYear);

  // Obtener máquinas y procesos de la base de datos
  useEffect(() => {
    const fetchMachines = async () => {
      try {
        setLoading(true);

        // Configuración específica de máquinas por proceso según especificaciones
        const processToMachines: Record<number, number[]> = {
          1: [14016, 14075], // Tapas: EN-10A, EN-10B
          2: [11041], // Horno: HG-01
          10: [1001], // Corte: CZ-01
          20: [2001, 2002], // Punzonado: PZ-01, PZ-02
          30: [3001, 3002, 3003, 3004, 3005, 3006, 3007, 3008, 3009, 3010, 14017], // Troquelado + Despunte: TQ-01 a TQ-11
          40: [4001, 4002, 4003, 4004, 4005, 14081, 12004], // Doblez: DB-01 a DB-06, RM-04
          50: [5001, 5002, 5003], // Soldadura: SP-01, SP-02, SP-03
          60: [6001, 6002], // MIG: SE-01, SE-02
          70: [11092], // Lavado: TL-01
          80: [8001, 8002, 8003], // Pintura: CB-01, CB-02, CB-03
          90: [10085, 14009, 14065, 14010, 14011, 14012, 14013, 14014, 14015, 14066, 14067, 14068, 14069, 14070, 14071, 14072, 14073, 14074], // Ensamle: EN-01A a EN-09B
          100: [10004, 10005], // Empaque: ZN-04, ZN-05
          130: [14090, 14092, 14093, 14094, 14095], // EnsambleInt: MESA, MESA2, MESA3, MESA4, MESA5
          140: [14001, 14002, 14003, 14004, 14005, 14006, 14007], // Inyeccion: INY-01 a INY-07
          170: [11072, 14088] // RoscadoConectores: RC-01, RC-MANUAL1
        };

        // Obtener información de procesos
        const { data: processData, error: processError } = await supabase
          .from('processes')
          .select('id, name');
        if (processError) throw processError;

        // Obtener información de máquinas
        const { data: machineData, error: machineError } = await supabase
          .from('machines')
          .select('id, name, status');
        if (machineError) throw machineError;

        console.log('📊 Procesos cargados:', processData?.length);
        console.log('🏭 Máquinas cargadas:', machineData?.length);

        // Crear mapa de máquinas por ID para búsqueda rápida
        const machineMap = new Map(machineData?.map(m => [m.id, m]) || []);
        const processMap = new Map(processData?.map(p => [p.id, p]) || []);

        // Construir configuración de procesos usando la especificación exacta
        const processConfigs: ProcessConfig[] = [];

        Object.entries(processToMachines).forEach(([processIdStr, machineIds]) => {
          const processId = parseInt(processIdStr);
          const process = processMap.get(processId);
          
          if (!process) {
            console.warn(`Proceso ${processId} no encontrado en la base de datos`);
            return;
          }

          // Para el proceso 30 (Troquelado), unificar con Despunte
          let processName = process.name;
          if (processId === 30) {
            const despunteProcess = processMap.get(3);
            if (despunteProcess) {
              processName = `${process.name} / ${despunteProcess.name}`;
            }
          }

          const machines: MachineConfig[] = [];
          
          machineIds.forEach(machineId => {
            const machine = machineMap.get(machineId);
            if (machine) {
              machines.push({
                id: machine.id,
                name: machine.name,
                processName: processName,
                processId: processId,
                isOperational: machine.status === 'ENCENDIDO',
                status: machine.status,
              });
            } else {
              console.warn(`Máquina ${machineId} no encontrada para el proceso ${processName}`);
            }
          });

          if (machines.length > 0) {
            // Asignar horas específicas para procesos de 2 turnos
            const is2ShiftProcess = processId === 140 || processId === 170; // Inyección y RoscadoConectores
            
            processConfigs.push({
              processId: processId,
              processName: processName,
              operatorCount: 1,
              efficiency: 100,
              machines: machines.sort((a, b) => a.name.localeCompare(b.name)),
              availableHours: is2ShiftProcess ? undefined : undefined, // Se asignará dinámicamente
            });
          }
        });

        // Ordenar procesos por nombre
        processConfigs.sort((a, b) => a.processName.localeCompare(b.processName));

        console.log('🏭 Procesos configurados:', processConfigs.map(p => `${p.processName} (${p.machines.length} máquinas)`));

        setProcesses(processConfigs);
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

  // Función para calcular la efectividad de un proceso
  const calculateEffectiveness = (process: ProcessConfig) => {
    const operationalMachines = process.machines.filter(m => m.isOperational).length;
    if (operationalMachines === 0) return 0;
    
    const utilizationRate = process.operatorCount / operationalMachines;
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
    // Asignar horas específicas a cada proceso según su tipo
    const processesWithHours = processes.map(process => ({
      ...process,
      availableHours: (process.processId === 140 || process.processId === 170) 
        ? availableHours2Shifts 
        : availableHours
    }));

    const config: OperatorConfig = {
      processes: processesWithHours,
      workMonth,
      workYear,
      availableHours // Horas estándar por defecto
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
          {/* Selector de Modo */}
          <div className="space-y-4 mb-6">
            <Label>Modo de Cálculo de Capacidad</Label>
            <div className="flex gap-4">
              <Button
                variant={dateRangeMode === 'monthly' ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => {
                  setDateRangeMode('monthly');
                  setCalendarPopoverOpen(false);
                }}
              >
                <CalendarIcon className="h-4 w-4 mr-2" />
                Mes Completo
              </Button>
              <Button
                variant={dateRangeMode === 'custom' ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => setDateRangeMode('custom')}
              >
                <CalendarRange className="h-4 w-4 mr-2" />
                Rango Personalizado
              </Button>
            </div>
          </div>

          {dateRangeMode === 'monthly' ? (
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
          ) : (
            <div className="space-y-4">
              <Label>Seleccionar Rango de Fechas</Label>
              <Popover open={calendarPopoverOpen && dateRangeMode === 'custom'} onOpenChange={setCalendarPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={`w-full justify-start text-left font-normal ${
                      !customDateRange && "text-muted-foreground"
                    }`}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {customDateRange?.from ? (
                      customDateRange.to ? (
                        <>
                          {format(customDateRange.from, 'dd/MM/yyyy', { locale: es })} - {format(customDateRange.to, 'dd/MM/yyyy', { locale: es })}
                        </>
                      ) : (
                        format(customDateRange.from, 'dd/MM/yyyy', { locale: es })
                      )
                    ) : (
                      <span>Seleccione un rango de fechas</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="range"
                    selected={customDateRange}
                    onSelect={setCustomDateRange}
                    numberOfMonths={2}
                    locale={es}
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
              
              {customDateRange?.from && customDateRange?.to && (
                <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 p-4 rounded-lg space-y-3">
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-100">Resumen del Rango Seleccionado</p>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Desde:</span>
                      <p className="font-medium">{format(customDateRange.from, 'dd/MM/yyyy', { locale: es })}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Hasta:</span>
                      <p className="font-medium">{format(customDateRange.to, 'dd/MM/yyyy', { locale: es })}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Días laborables:</span>
                      <p className="font-medium text-green-600">{workingDays}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Horas disponibles:</span>
                      <p className="font-medium text-primary text-lg">{customAvailableHours.toFixed(2)} h</p>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-blue-200 dark:border-blue-800">
                    <p className="text-xs text-blue-800 dark:text-blue-200">
                      * Se excluyen domingos y días festivos colombianos del cálculo
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
          
          {dateRangeMode === 'monthly' && (
            <div className="col-span-full mt-2 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-medium text-blue-600">
                Días festivos en {new Date(workYear, workMonth - 1).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })}
              </span>
            </div>
            <div className="text-xs text-blue-800 dark:text-blue-200">
              {(() => {
                const holidays = getColombianHolidays(workYear);
                const monthHolidays = holidays.filter(h => h.getMonth() === workMonth - 1);
                return monthHolidays.length > 0 
                  ? monthHolidays.map(h => formatHolidayDate(h)).join('; ')
                  : 'No hay días festivos este mes';
              })()}
            </div>
          </div>
          )}
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

      {/* Configuración de Procesos Estándar (3 Turnos) */}
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Procesos Estándar (3 Turnos)</CardTitle>
            <CardDescription>
              Horario estándar: 3 turnos diarios de lunes a viernes + 2 turnos los sábados
              <div className="mt-2 flex items-center gap-2">
                <Clock className="h-4 w-4" />
                <span className="font-semibold">{availableHours.toFixed(1)}h disponibles por operario</span>
              </div>
            </CardDescription>
          </CardHeader>
        </Card>

        {processes.filter(p => p.processId !== 140 && p.processId !== 170).map((process) => {
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

                  <div className="flex items-center justify-center p-2 bg-muted/50 rounded">
                    <div className="text-center">
                      <div className="text-lg font-bold">{(capacityMinutes/60).toFixed(1)}h</div>
                      <div className="text-xs text-muted-foreground">Capacidad Total</div>
                    </div>
                  </div>
                </div>

                {/* Métricas del proceso */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
                  <div className="text-center p-2 bg-muted/50 rounded">
                    <div className="text-lg font-bold text-green-600">{operationalCount}</div>
                    <div className="text-xs text-muted-foreground">Máq. Operativas</div>
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

      {/* Configuración de Procesos Especiales (2 Turnos) */}
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Procesos con Horario Especial (2 Turnos)
            </CardTitle>
            <CardDescription>
              Horario especial: 2 turnos diarios (mañana y tarde) de lunes a sábado
              <div className="mt-2 space-y-1">
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4" />
                  <span className="font-semibold">{availableHours2Shifts.toFixed(1)}h disponibles por operario</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  • Lunes a Viernes: Turno mañana (5:25am-1:00pm) + Turno tarde (1:00pm-8:37pm)
                </div>
                <div className="text-xs text-muted-foreground">
                  • Sábados: Turno mañana (5:25am-11:30am) + Turno tarde (11:30am-5:25pm)
                </div>
              </div>
            </CardDescription>
          </CardHeader>
        </Card>

        {processes.filter(p => p.processId === 140 || p.processId === 170).map((process) => {
          const operationalCount = process.machines.filter(m => m.isOperational).length;
          const effectiveStations = Math.min(operationalCount, process.operatorCount);
          const capacityMinutes = effectiveStations * availableHours2Shifts * 60 * (process.efficiency / 100);
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
                    <Badge variant="secondary" className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      2 Turnos
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
                      onChange={(e) => handleEfficiencyChange(process.processId, parseInt(e.target.value) || 100)}
                      className="text-center"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Capacidad (minutos)</Label>
                    <div className="text-center p-2 bg-muted rounded-md">
                      <div className="text-lg font-bold">
                        {capacityMinutes.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Métricas en el header */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-4">
                  <div className="text-center p-2 bg-muted/50 rounded">
                    <div className="text-lg font-bold text-green-600">{operationalCount}</div>
                    <div className="text-xs text-muted-foreground">Máq. Operativas</div>
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

      {/* Gestión de Referencias */}
      <Card className="bg-muted/50">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-primary" />
              <div>
                <div className="font-medium">Gestión de Referencias</div>
                <div className="text-sm text-muted-foreground">
                  Administrar referencias de máquinas y procesos
                </div>
              </div>
            </div>
            <Dialog open={isReferenceManagerOpen} onOpenChange={setIsReferenceManagerOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Settings className="h-4 w-4 mr-2" />
                  Administrar Referencias
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Gestión de Referencias de Máquinas y Procesos</DialogTitle>
                </DialogHeader>
                <ReferenceManager onClose={() => setIsReferenceManagerOpen(false)} />
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>

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