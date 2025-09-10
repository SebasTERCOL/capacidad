import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Users, Calendar, Clock } from "lucide-react";

// Configuración de procesos y requerimientos
const PROCESS_REQUIREMENTS = {
  'Punzonado': { machines: 2, minOperators: 2 },
  'Corte': { machines: 1, minOperators: 1 },
  'Troquelado': { machines: 10, minOperators: 5 },
  'Doblez': { machines: 6, minOperators: 4 },
  'Soldadura': { machines: 3, minOperators: 3 },
  'MIG': { machines: 2, minOperators: 1 },
  'EnsambleInt': { machines: 4, minOperators: 3 },
  'Lavado': { machines: 1, minOperators: 1, special: true },
  'Pintura': { machines: 4, minOperators: 4, special: true }, // 3 cabinas + horno
  'Ensamble': { machines: 20, minOperators: 9 },
  'Inyección': { machines: 8, minOperators: 7 }
} as const;

export interface OperatorConfig {
  availableOperators: { [process: string]: number };
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
  const [operators, setOperators] = useState<{ [process: string]: number }>(() => {
    const initial: { [process: string]: number } = {};
    Object.keys(PROCESS_REQUIREMENTS).forEach(process => {
      initial[process] = PROCESS_REQUIREMENTS[process as keyof typeof PROCESS_REQUIREMENTS].minOperators;
    });
    return initial;
  });

  const [workMonth, setWorkMonth] = useState(new Date().getMonth() + 1);
  const [workYear, setWorkYear] = useState(new Date().getFullYear());

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

  const handleOperatorChange = (process: string, value: string) => {
    const numValue = parseInt(value) || 0;
    setOperators(prev => ({
      ...prev,
      [process]: numValue
    }));
  };

  const handleContinue = () => {
    const config: OperatorConfig = {
      availableOperators: operators,
      workMonth,
      workYear,
      availableHours
    };
    onConfigComplete(config);
    onNext();
  };

  const getProcessStatus = (process: string) => {
    const required = PROCESS_REQUIREMENTS[process as keyof typeof PROCESS_REQUIREMENTS];
    const available = operators[process] || 0;
    
    if (available < required.minOperators) {
      return { status: 'insufficient', message: `Faltan ${required.minOperators - available} operarios` };
    } else if (available === required.minOperators) {
      return { status: 'optimal', message: 'Configuración óptima' };
    } else {
      return { status: 'excess', message: `${available - required.minOperators} operarios adicionales` };
    }
  };

  const totalOperators = Object.values(operators).reduce((sum, count) => sum + count, 0);
  const hasInsufficientOperators = Object.keys(PROCESS_REQUIREMENTS).some(process => {
    const required = PROCESS_REQUIREMENTS[process as keyof typeof PROCESS_REQUIREMENTS];
    return (operators[process] || 0) < required.minOperators;
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Configuración de Operarios
          </CardTitle>
          <CardDescription>
            Configure la cantidad de operarios disponibles por proceso y el período de análisis
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

      {/* Configuración de Operarios */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Asignación de Operarios por Proceso</CardTitle>
          <CardDescription>
            Configure el número de operarios disponibles. Los procesos marcados con ⚠️ serán evaluados por peso.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(PROCESS_REQUIREMENTS).map(([process, config]) => {
              const status = getProcessStatus(process);
              const isSpecial = 'special' in config && config.special;
              
              return (
                <div key={process} className="space-y-2">
                  <Label htmlFor={process} className="flex items-center gap-2">
                    {process}
                    {isSpecial && <span className="text-orange-500">⚠️</span>}
                    <span className="text-xs text-muted-foreground">
                      (mín: {config.minOperators})
                    </span>
                  </Label>
                  <Input
                    id={process}
                    type="number"
                    min="0"
                    value={operators[process] || 0}
                    onChange={(e) => handleOperatorChange(process, e.target.value)}
                    className={
                      status.status === 'insufficient' ? 'border-destructive' :
                      status.status === 'optimal' ? 'border-green-500' :
                      'border-muted-foreground'
                    }
                  />
                  <div className={`text-xs ${
                    status.status === 'insufficient' ? 'text-destructive' :
                    status.status === 'optimal' ? 'text-green-600' :
                    'text-muted-foreground'
                  }`}>
                    {status.message}
                  </div>
                </div>
              );
            })}
          </div>
          
          <div className="mt-6 p-4 bg-muted rounded-lg">
            <div className="flex items-center justify-between">
              <span className="font-medium">Total de Operarios:</span>
              <span className="text-xl font-bold text-primary">{totalOperators}</span>
            </div>
            {hasInsufficientOperators && (
              <div className="mt-2 text-sm text-destructive">
                ⚠️ Algunos procesos no tienen suficientes operarios asignados
              </div>
            )}
          </div>
        </CardContent>
      </Card>

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