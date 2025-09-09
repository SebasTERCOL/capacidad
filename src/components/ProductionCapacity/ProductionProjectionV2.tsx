import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Clock, Cog, AlertCircle, Users, Calendar, Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ProductionRequest } from "./FileUpload";
import { OperatorConfig } from "./OperatorConfiguration";

interface ProjectionInfo {
  referencia: string;
  cantidadRequerida: number;
  sam: number;
  tiempoTotal: number;
  maquina: string;
  estadoMaquina: string;
  proceso: string;
  operadoresRequeridos: number;
  operadoresDisponibles: number;
  capacidadPorcentaje: number;
  ocupacionMaquina: number;
  ocupacionProceso: number;
  alerta: string | null;
  especial?: boolean;
}

interface ProductionProjectionV2Props {
  data: ProductionRequest[];
  operatorConfig: OperatorConfig;
  onNext: () => void;
  onBack: () => void;
  onProjectionComplete: (projection: ProjectionInfo[]) => void;
}

export const ProductionProjectionV2: React.FC<ProductionProjectionV2Props> = ({ 
  data, 
  operatorConfig,
  onNext, 
  onBack, 
  onProjectionComplete 
}) => {
  const [projection, setProjection] = useState<ProjectionInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (data.length > 0) {
      calculateProjection();
    }
  }, [data, operatorConfig]);

  // Trackear tiempo acumulado por proceso y por máquina para distribución inteligente
  const processWorkload = new Map<string, number>();
  const machineWorkload = new Map<string, number>();

  const calculateProjection = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const results: ProjectionInfo[] = [];
      processWorkload.clear();
      machineWorkload.clear();
      
      for (const item of data) {
        // Obtener información de machines_processes para esta referencia
        const { data: mpData, error: mpError } = await supabase
          .from('machines_processes')
          .select(`
            sam,
            frequency,
            id_machine,
            id_process,
            machines!inner(name, status),
            processes!inner(name)
          `)
          .eq('ref', item.referencia)
          .order('machines(status)', { ascending: false });

        if (mpError) {
          console.error('Error fetching machine process:', mpError);
          continue;
        }

        if (!mpData || mpData.length === 0) {
          results.push({
            referencia: item.referencia,
            cantidadRequerida: item.cantidad,
            sam: 0,
            tiempoTotal: 0,
            maquina: 'N/A',
            estadoMaquina: 'N/A',
            proceso: 'N/A',
            operadoresRequeridos: 0,
            operadoresDisponibles: 0,
            capacidadPorcentaje: 0,
            ocupacionMaquina: 0,
            ocupacionProceso: 0,
            alerta: 'No se encontró configuración de máquina/proceso'
          });
          continue;
        }

        // Tomar el primer resultado (mejor máquina disponible)
        const machineProcess = mpData[0];
        const proceso = machineProcess.processes.name;
        const maquina = machineProcess.machines.name;
        const estadoMaquina = machineProcess.machines.status;
        const sam = machineProcess.sam || 0; // unidades/minuto desde machines_processes
        const tiempoTotal = item.cantidad * sam; // minutos totales

        // Verificar si es proceso especial (Lavado/Pintura)
        const isSpecialProcess = proceso === 'Lavado' || proceso === 'Pintura';
        
        let alerta: string | null = null;
        let capacidadPorcentaje = 0;
        const operadoresDisponibles = operatorConfig.availableOperators[proceso] || 0;
        
        if (isSpecialProcess) {
          alerta = 'Proceso evaluado por peso - pendiente cálculo específico';
          results.push({
            referencia: item.referencia,
            cantidadRequerida: item.cantidad,
            sam,
            tiempoTotal,
            maquina,
            estadoMaquina,
            proceso,
            operadoresRequeridos: 1,
            operadoresDisponibles,
            capacidadPorcentaje: 0,
            ocupacionMaquina: 0,
            ocupacionProceso: 0,
            alerta,
            especial: true
          });
          continue;
        }

        // Calcular requerimientos de operarios según el proceso
        const processRequirements = getProcessRequirements(proceso);
        const operadoresRequeridos = processRequirements.minOperators;

        if (operadoresDisponibles < operadoresRequeridos) {
          alerta = `Insuficientes operarios: ${operadoresDisponibles}/${operadoresRequeridos}`;
          capacidadPorcentaje = (operadoresDisponibles / operadoresRequeridos) * 100;
        } else {
          // Calcular capacidad basada en horas disponibles
          const horasRequeridas = tiempoTotal / 60; // convertir minutos a horas
          const horasDisponibles = operatorConfig.availableHours * operadoresDisponibles;
          
          // Agregar tiempo acumulado del proceso y máquina
          const tiempoAcumuladoProceso = processWorkload.get(proceso) || 0;
          const nuevoTiempoAcumuladoProceso = tiempoAcumuladoProceso + horasRequeridas;
          processWorkload.set(proceso, nuevoTiempoAcumuladoProceso);
          
          const tiempoAcumuladoMaquina = machineWorkload.get(maquina) || 0;
          const nuevoTiempoAcumuladoMaquina = tiempoAcumuladoMaquina + horasRequeridas;
          machineWorkload.set(maquina, nuevoTiempoAcumuladoMaquina);
          
          capacidadPorcentaje = (nuevoTiempoAcumuladoProceso / horasDisponibles) * 100;
          
          if (capacidadPorcentaje > 100) {
            alerta = `Sobrecarga del proceso: ${capacidadPorcentaje.toFixed(1)}%`;
          } else if (capacidadPorcentaje > 85) {
            alerta = `Capacidad alta: ${capacidadPorcentaje.toFixed(1)}%`;
          } else if (estadoMaquina !== 'ENCENDIDO') {
            alerta = `Máquina en estado: ${estadoMaquina}`;
          }
        }

        // Calcular ocupación de máquina y proceso
        const horasRequeridas = tiempoTotal / 60;
        const horasDisponiblesPorMaquina = operatorConfig.availableHours;
        const horasDisponiblesPorProceso = operatorConfig.availableHours * operadoresDisponibles;
        
        const ocupacionMaquina = ((machineWorkload.get(maquina) || horasRequeridas) / horasDisponiblesPorMaquina) * 100;
        const ocupacionProceso = ((processWorkload.get(proceso) || horasRequeridas) / horasDisponiblesPorProceso) * 100;

        results.push({
          referencia: item.referencia,
          cantidadRequerida: item.cantidad,
          sam,
          tiempoTotal,
          maquina,
          estadoMaquina,
          proceso,
          operadoresRequeridos,
          operadoresDisponibles,
          capacidadPorcentaje,
          ocupacionMaquina,
          ocupacionProceso,
          alerta
        });
      }
      
      setProjection(results);
      onProjectionComplete(results);
    } catch (error) {
      console.error('Error calculating projection:', error);
      setError('Error al calcular la proyección. Verifique la conexión a la base de datos.');
    }
    
    setLoading(false);
  };

  const getProcessRequirements = (process: string) => {
    const requirements: { [key: string]: { minOperators: number } } = {
      'Punzonado': { minOperators: 2 },
      'Corte': { minOperators: 1 },
      'Troquelado': { minOperators: 5 },
      'Doblez': { minOperators: 4 },
      'Soldadura': { minOperators: 3 },
      'MIG': { minOperators: 1 },
      'EnsambleInt': { minOperators: 3 },
      'Lavado': { minOperators: 1 },
      'Pintura': { minOperators: 4 },
      'Ensamble': { minOperators: 9 },
      'Inyección': { minOperators: 7 }
    };
    return requirements[process] || { minOperators: 1 };
  };

  const formatTime = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${hours}h ${mins}m`;
  };

  const getStatusVariant = (status: string) => {
    switch (status?.toUpperCase()) {
      case 'ENCENDIDO': return 'default';
      case 'APAGADO': return 'secondary';
      case 'MANTENIMIENTO': return 'destructive';
      default: return 'secondary';
    }
  };

  const getCapacityVariant = (percentage: number) => {
    if (percentage > 100) return 'destructive';
    if (percentage > 85) return 'secondary';
    return 'default';
  };

  const totalTime = projection.reduce((sum, item) => sum + item.tiempoTotal, 0);
  const processesWithProblems = projection.filter(p => p.alerta && !p.especial).length;
  const specialProcesses = projection.filter(p => p.especial).length;

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="animate-spin h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p>Calculando proyección de producción con operarios...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-4" />
          <p className="text-red-500 mb-4">{error}</p>
          <Button onClick={() => calculateProjection()}>Reintentar</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Proyección de Producción con Operarios
          </CardTitle>
          <CardDescription>
            Análisis realista considerando operarios disponibles y capacidad temporal
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Resumen del Período */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Calendar className="h-5 w-5" />
            Configuración del Período
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-muted rounded-lg">
              <div className="text-xl font-bold text-primary">{operatorConfig.workMonth}/{operatorConfig.workYear}</div>
              <div className="text-sm text-muted-foreground">Período</div>
            </div>
            <div className="text-center p-4 bg-muted rounded-lg">
              <div className="text-xl font-bold text-primary">{operatorConfig.availableHours.toFixed(1)}h</div>
              <div className="text-sm text-muted-foreground">Horas/Operario</div>
            </div>
            <div className="text-center p-4 bg-muted rounded-lg">
              <div className="text-xl font-bold text-primary">
                {Object.values(operatorConfig.availableOperators).reduce((sum, count) => sum + count, 0)}
              </div>
              <div className="text-sm text-muted-foreground">Total Operarios</div>
            </div>
            <div className="text-center p-4 bg-muted rounded-lg">
              <div className="text-xl font-bold text-primary">
                {(Object.values(operatorConfig.availableOperators).reduce((sum, count) => sum + count, 0) * operatorConfig.availableHours).toFixed(0)}h
              </div>
              <div className="text-sm text-muted-foreground">Capacidad Total</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Resumen General */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Resumen de Proyección</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-muted rounded-lg">
              <div className="text-2xl font-bold text-primary">{projection.length}</div>
              <div className="text-sm text-muted-foreground">Referencias</div>
            </div>
            <div className="text-center p-4 bg-muted rounded-lg">
              <div className="text-2xl font-bold text-primary">{formatTime(totalTime)}</div>
              <div className="text-sm text-muted-foreground">Tiempo Total</div>
            </div>
            <div className="text-center p-4 bg-muted rounded-lg">
              <div className="text-2xl font-bold text-orange-600">{specialProcesses}</div>
              <div className="text-sm text-muted-foreground">Procesos Especiales</div>
            </div>
            <div className="text-center p-4 bg-muted rounded-lg">
              <div className="text-2xl font-bold text-red-600">{processesWithProblems}</div>
              <div className="text-sm text-muted-foreground">Con Alertas</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabla de Proyección */}
      <Card>
        <CardHeader>
          <CardTitle>Detalle por Referencia</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Referencia</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
                <TableHead className="text-right">SAM (min/un)</TableHead>
                <TableHead className="text-right">Tiempo Total</TableHead>
                <TableHead>Proceso</TableHead>
                <TableHead>Máquina</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-center">Operarios</TableHead>
                <TableHead className="text-center">Capacidad</TableHead>
                <TableHead className="text-center">Ocupación Máq.</TableHead>
                <TableHead className="text-center">Ocupación Proc.</TableHead>
                <TableHead>Alertas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projection.map((item, index) => (
                <TableRow key={index} className={item.especial ? 'bg-orange-50' : ''}>
                  <TableCell className="font-medium">{item.referencia}</TableCell>
                  <TableCell className="text-right">{item.cantidadRequerida.toLocaleString()}</TableCell>
                  <TableCell className="text-right">{item.sam}</TableCell>
                  <TableCell className="text-right font-medium">{formatTime(item.tiempoTotal)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {item.especial && <span className="text-orange-500">⚠️</span>}
                      {item.proceso}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Cog className="h-4 w-4" />
                      {item.maquina}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={getStatusVariant(item.estadoMaquina)}>
                      {item.estadoMaquina}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center gap-1 justify-center">
                      <Users className="h-4 w-4" />
                      <span className={item.operadoresDisponibles < item.operadoresRequeridos ? 'text-red-600 font-medium' : ''}>
                        {item.operadoresDisponibles}/{item.operadoresRequeridos}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    {!item.especial && (
                      <Badge variant={getCapacityVariant(item.capacidadPorcentaje)}>
                        {item.capacidadPorcentaje.toFixed(1)}%
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {!item.especial && (
                      <Badge variant={getCapacityVariant(item.ocupacionMaquina)}>
                        {item.ocupacionMaquina.toFixed(1)}%
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {!item.especial && (
                      <Badge variant={getCapacityVariant(item.ocupacionProceso)}>
                        {item.ocupacionProceso.toFixed(1)}%
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {item.alerta && (
                      <Badge variant="destructive" className="flex items-center gap-1 w-fit">
                        <AlertCircle className="h-3 w-3" />
                        {item.alerta}
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button variant="outline" onClick={onBack}>
          Volver
        </Button>
        <Button onClick={onNext} className="flex-1">
          Ver Reporte Final
        </Button>
      </div>
    </div>
  );
};