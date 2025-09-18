import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Activity, Calendar, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { OperatorConfig } from "./OperatorConfiguration";
import HierarchicalCapacityView from './HierarchicalCapacityView';

export interface ProjectionInfo {
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
  alerta?: string | null;
  especial?: boolean;
}

interface ProductionProjectionV2Props {
  data: { referencia: string; cantidad: number }[];
  operatorConfig: OperatorConfig;
  onNext: () => void;
  onBack: () => void;
  onProjectionComplete: (projectionData: ProjectionInfo[]) => void;
  onStartOver: () => void;
}

export const ProductionProjectionV2: React.FC<ProductionProjectionV2Props> = ({ 
  data, 
  operatorConfig,
  onNext, 
  onBack, 
  onProjectionComplete,
  onStartOver
}) => {
  const [projection, setProjection] = useState<ProjectionInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0, currentRef: '' });
  const [startTime, setStartTime] = useState<number>(0);
  
  // Cache para BOM y machines_processes para evitar consultas repetidas
  const [bomCache] = useState(new Map<string, Map<string, number>>());
  const [allMachinesProcesses, setAllMachinesProcesses] = useState<any[]>([]);
  const [allBomData, setAllBomData] = useState<any[]>([]);

  useEffect(() => {
    if (data.length > 0) {
      calculateProjection();
    }
  }, [data, operatorConfig]);

  // Función optimizada para cargar todos los datos BOM de una vez
  const loadAllBomData = async () => {
    console.log('🚀 Cargando todos los datos BOM...');
    const { data: bomData, error } = await supabase
      .from('bom')
      .select('product_id, component_id, amount');
    
    if (error) {
      console.error('❌ Error cargando BOM:', error);
      throw error;
    }
    
    setAllBomData(bomData || []);
    console.log(`✅ Cargados ${bomData?.length || 0} registros BOM`);
    return bomData || [];
  };

  // Función optimizada para cargar todos los datos de machines_processes
  const loadAllMachinesProcesses = async () => {
    console.log('🚀 Cargando todos los datos machines_processes...');
    const { data: mpData, error } = await supabase
      .from('machines_processes')
      .select(`
        sam, frequency, ref, id_machine, id_process,
        machines!inner(id, name, status),
        processes!inner(id, name)
      `);
    
    if (error) {
      console.error('❌ Error cargando machines_processes:', error);
      throw error;
    }
    
    setAllMachinesProcesses(mpData || []);
    console.log(`✅ Cargados ${mpData?.length || 0} registros machines_processes`);
    return mpData || [];
  };

  // Función recursiva optimizada con cache
  const getRecursiveBOMOptimized = (
    productId: string, 
    quantity: number = 1, 
    level: number = 0, 
    visited: Set<string> = new Set()
  ): Map<string, number> => {
    const cacheKey = `${productId}_${quantity}`;
    
    // Verificar cache
    if (bomCache.has(cacheKey)) {
      return new Map(bomCache.get(cacheKey)!);
    }
    
    // Prevenir loops infinitos
    if (level > 10 || visited.has(productId)) {
      console.warn(`🔄 Loop detectado o nivel máximo alcanzado para ${productId}`);
      return new Map();
    }
    
    visited.add(productId);
    const componentsMap = new Map<string, number>();
    
    // Buscar en datos precargados
    const bomItems = allBomData.filter(item => 
      item.product_id.trim().toUpperCase() === productId.trim().toUpperCase()
    );
    
    if (bomItems.length === 0) {
      // Es un componente final, cachear resultado vacío
      bomCache.set(cacheKey, componentsMap);
      return componentsMap;
    }
    
    // Procesar cada componente
    for (const bomItem of bomItems) {
      const componentId = bomItem.component_id.trim().toUpperCase();
      const componentQuantity = quantity * bomItem.amount;
      
      // Agregar este componente al mapa
      const existingQuantity = componentsMap.get(componentId) || 0;
      componentsMap.set(componentId, existingQuantity + componentQuantity);
      
      // Buscar recursivamente subcomponentes
      const subComponents = getRecursiveBOMOptimized(componentId, componentQuantity, level + 1, new Set(visited));
      
      // Agregar los subcomponentes al mapa principal
      for (const [subComponentId, subQuantity] of subComponents) {
        const existingSubQuantity = componentsMap.get(subComponentId) || 0;
        componentsMap.set(subComponentId, existingSubQuantity + subQuantity);
      }
    }
    
    // Cachear resultado
    bomCache.set(cacheKey, componentsMap);
    return componentsMap;
  };

  const calculateProjection = async () => {
    if (!data || data.length === 0) {
      setProjection([]);
      return;
    }

    setLoading(true);
    setError(null);
    setStartTime(Date.now());
    setProgress({ current: 0, total: data.length + 2, currentRef: 'Cargando datos...' });
    
    try {
      // 1. Cargar todos los datos de una vez (optimización principal)
      setProgress({ current: 1, total: data.length + 2, currentRef: 'Cargando BOM...' });
      await loadAllBomData();
      
      setProgress({ current: 2, total: data.length + 2, currentRef: 'Cargando procesos...' });
      await loadAllMachinesProcesses();

      const results: ProjectionInfo[] = [];
      const processWorkload = new Map<string, number>();
      const machineWorkload = new Map<string, number>();

      // Inicializar carga de trabajo para todas las máquinas operativas
      const allMachines: any[] = [];
      operatorConfig.processes.forEach(process => {
        process.machines
          .filter(m => m.isOperational)
          .forEach(machine => {
            allMachines.push({ ...machine, processName: process.processName });
            machineWorkload.set(machine.name, 0);
          });
      });

      // 2. Procesar cada referencia (ahora con datos precargados)
      for (let i = 0; i < data.length; i++) {
        const item = data[i];
        setProgress({ 
          current: i + 3, 
          total: data.length + 2, 
          currentRef: `Procesando ${item.referencia}...` 
        });

        // Obtener BOM usando función optimizada
        const allComponents = getRecursiveBOMOptimized(item.referencia, item.cantidad);

        // Obtener procesos para la referencia principal usando datos precargados
        const referenceMachinesProcesses = allMachinesProcesses.filter(mp => 
          mp.ref === item.referencia
        );

        // Crear lista de referencias a procesar
        const referencesToProcess: {
          ref: string;
          cantidad: number;
          isMain: boolean;
          parentRef?: string;
        }[] = [];

        // Agregar SIEMPRE la referencia principal
        referencesToProcess.push({ 
          ref: item.referencia, 
          cantidad: item.cantidad, 
          isMain: true
        });

        // Agregar componentes del BOM
        for (const [componentId, totalQuantity] of allComponents.entries()) {
          referencesToProcess.push({
            ref: componentId,
            cantidad: totalQuantity,
            isMain: false,
            parentRef: item.referencia
          });
        }

        // Procesar cada referencia
        for (const refToProcess of referencesToProcess) {
          // Obtener procesos usando datos precargados
          const machinesProcesses = allMachinesProcesses.filter(mp => 
            mp.ref === refToProcess.ref
          );

          if (!machinesProcesses || machinesProcesses.length === 0) {
            // Referencia sin tiempo definido
            results.push({
              referencia: refToProcess.isMain ? item.referencia : `${item.referencia} → ${refToProcess.ref}`,
              cantidadRequerida: refToProcess.cantidad,
              sam: 0,
              tiempoTotal: 0,
              maquina: 'Sin definir',
              estadoMaquina: 'Sin definir',
              proceso: 'Sin definir',
              operadoresRequeridos: 0,
              operadoresDisponibles: 0,
              capacidadPorcentaje: 0,
              ocupacionMaquina: 0,
              ocupacionProceso: 0,
              alerta: `🔴 Falta SAM para ${refToProcess.ref} - No inscrita en machines_processes`
            });
            continue;
          }

          // Filtrar máquinas operativas
          const availableMachineProcesses = machinesProcesses.filter((mp: any) => {
            const processConfig = operatorConfig.processes.find(p => 
              p.processName.toLowerCase() === mp.processes.name.toLowerCase()
            );
            if (!processConfig) return false;
            const machine = processConfig.machines.find(m => m.id === mp.id_machine);
            return machine ? machine.isOperational : true;
          });

          if (availableMachineProcesses.length === 0) {
            const firstProcess = machinesProcesses[0] as any;
            results.push({
              referencia: refToProcess.isMain ? item.referencia : `${item.referencia} → ${refToProcess.ref}`,
              cantidadRequerida: refToProcess.cantidad,
              sam: firstProcess.sam || 0,
              tiempoTotal: 0,
              maquina: firstProcess.machines.name,
              estadoMaquina: firstProcess.machines.status,
              proceso: firstProcess.processes.name,
              operadoresRequeridos: 1,
              operadoresDisponibles: 0,
              capacidadPorcentaje: 0,
              ocupacionMaquina: 0,
              ocupacionProceso: 0,
              alerta: '❌ No hay máquinas operativas disponibles'
            });
            continue;
          }

          // Seleccionar mejor máquina (lógica optimizada)
          const bestMachine = selectBestMachine(availableMachineProcesses, machineWorkload, operatorConfig);
          if (!bestMachine) continue;

          // Calcular tiempos y ocupación
          const projectionResult = calculateProcessTime(
            bestMachine, 
            refToProcess, 
            item, 
            operatorConfig, 
            machineWorkload, 
            processWorkload
          );

          results.push(projectionResult);
        }
      }
      
      setProjection(results);
      onProjectionComplete(results);
    } catch (error) {
      console.error('Error calculating projection:', error);
      setError('Error al calcular la proyección. Verifique la conexión a la base de datos.');
    }
    
    setLoading(false);
    setProgress({ current: 0, total: 0, currentRef: '' });
  };

  // Función helper para seleccionar la mejor máquina
  const selectBestMachine = (
    availableMachineProcesses: any[],
    machineWorkload: Map<string, number>,
    operatorConfig: OperatorConfig
  ) => {
    const totalMachinesForRef = availableMachineProcesses.length;
    const scarcityFactor = totalMachinesForRef === 1 ? 1 : (1 / totalMachinesForRef);

    let bestMachine: any = null;
    let minWorkload = Infinity;

    for (const mp of availableMachineProcesses) {
      const processConfig = operatorConfig.processes.find(p => 
        p.processName.toLowerCase() === mp.processes.name.toLowerCase()
      );
      if (!processConfig) continue;
      
      const machine = processConfig.machines.find(m => m.id === mp.id_machine);
      if (!machine) continue;

      const currentWorkload = machineWorkload.get(machine.name) || 0;
      const adjustedWorkload = currentWorkload * (scarcityFactor > 0.5 ? 0.5 : 1);

      if (adjustedWorkload < minWorkload) {
        minWorkload = adjustedWorkload;
        bestMachine = { ...mp, machine: machine };
      }
    }

    return bestMachine;
  };

  // Función helper para calcular tiempo de proceso
  const calculateProcessTime = (
    bestMachine: any,
    refToProcess: any,
    item: any,
    operatorConfig: OperatorConfig,
    machineWorkload: Map<string, number>,
    processWorkload: Map<string, number>
  ): ProjectionInfo => {
    const sam = bestMachine.sam || 0;
    const maquina = bestMachine.machines.name;
    const estadoMaquina = bestMachine.machines.status;
    const proceso = bestMachine.processes.name;

    // Manejo especial para procesos donde SAM está en minutos/unidad
    const isMinutesPerUnitProcess = bestMachine.id_process === 140 || bestMachine.id_process === 170;
    const tiempoTotal = isMinutesPerUnitProcess
      ? (sam > 0 ? refToProcess.cantidad * sam : 0)
      : (sam > 0 ? refToProcess.cantidad / sam : 0);
    const tiempoTotalHoras = tiempoTotal / 60;

    // Verificar si es proceso especial
    const isSpecialProcess = proceso === 'Lavado' || proceso === 'Pintura';
    
    const processConfig = operatorConfig.processes.find(p => p.processName === proceso);
    const operadoresDisponibles = processConfig ? processConfig.operatorCount : 0;
    
    if (isSpecialProcess) {
      return {
        referencia: refToProcess.isMain ? item.referencia : `${item.referencia} → ${refToProcess.ref}`,
        cantidadRequerida: refToProcess.cantidad,
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
        alerta: '⚖️ Proceso evaluado por peso - pendiente cálculo específico',
        especial: true
      };
    }

    // Calcular requerimientos de operarios
    const processRequirements = getProcessRequirements(proceso);
    const operadoresRequeridos = processRequirements.minOperators;

    // Actualizar carga de trabajo
    const currentMachineWorkload = machineWorkload.get(maquina) || 0;
    const newMachineWorkload = currentMachineWorkload + tiempoTotalHoras;
    machineWorkload.set(maquina, newMachineWorkload);

    const currentProcessWorkload = processWorkload.get(proceso) || 0;
    const newProcessWorkload = currentProcessWorkload + tiempoTotalHoras;
    processWorkload.set(proceso, newProcessWorkload);

    // Calcular ocupación
    const horasDisponiblesPorMaquina = operatorConfig.availableHours;
    const horasDisponiblesPorProceso = operatorConfig.availableHours * operadoresDisponibles;
    
    const ocupacionMaquina = (newMachineWorkload / horasDisponiblesPorMaquina) * 100;
    const ocupacionProceso = (newProcessWorkload / horasDisponiblesPorProceso) * 100;

    // Determinar alertas
    let alerta: string | null = null;
    let capacidadPorcentaje = 0;

    if (operadoresDisponibles < operadoresRequeridos) {
      alerta = `⚠️ Insuficientes operarios: ${operadoresDisponibles}/${operadoresRequeridos}`;
      capacidadPorcentaje = (operadoresDisponibles / operadoresRequeridos) * 100;
    } else if (ocupacionMaquina > 100) {
      alerta = `🔴 Sobrecarga de máquina: ${ocupacionMaquina.toFixed(1)}%`;
      capacidadPorcentaje = ocupacionMaquina;
    } else if (ocupacionProceso > 100) {
      alerta = `🟡 Sobrecarga de proceso: ${ocupacionProceso.toFixed(1)}%`;
      capacidadPorcentaje = ocupacionProceso;
    } else if (ocupacionMaquina > 85) {
      alerta = `⚠️ Capacidad alta en máquina: ${ocupacionMaquina.toFixed(1)}%`;
      capacidadPorcentaje = ocupacionMaquina;
    } else if (ocupacionProceso > 85) {
      alerta = `⚠️ Capacidad alta en proceso: ${ocupacionProceso.toFixed(1)}%`;
      capacidadPorcentaje = ocupacionProceso;
    } else if (estadoMaquina !== 'ENCENDIDO') {
      alerta = `⚙️ Máquina en estado: ${estadoMaquina}`;
      capacidadPorcentaje = Math.max(ocupacionMaquina, ocupacionProceso);
    } else {
      capacidadPorcentaje = Math.max(ocupacionMaquina, ocupacionProceso);
    }

    return {
      referencia: refToProcess.isMain ? item.referencia : `${item.referencia} → ${refToProcess.ref}`,
      cantidadRequerida: refToProcess.cantidad,
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
    };
  };

  const getProcessRequirements = (process: string) => {
    const requirements: { [key: string]: { minOperators: number } } = {
      'punzonado': { minOperators: 2 },
      'corte': { minOperators: 1 },
      'troquelado': { minOperators: 5 },
      'doblez': { minOperators: 4 },
      'soldadura': { minOperators: 3 },
      'mig': { minOperators: 1 },
      'ensambleint': { minOperators: 3 },
      'lavado': { minOperators: 1 },
      'pintura': { minOperators: 4 },
      'ensamble': { minOperators: 9 },
      'inyección': { minOperators: 7 },
      'inyeccion': { minOperators: 7 }
    };
    return requirements[process.toLowerCase()] || { minOperators: 1 };
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

  // Capacidad por proceso basada en configuración y proyección actual
  const processesInfo = operatorConfig.processes
    .filter(process => process.processName.toLowerCase() !== 'reclasificacion') // Excluir Reclasificacion
    .reduce((acc, process) => {
      const operationalCount = process.machines.filter(m => m.isOperational).length;
      const effectiveCapacity = Math.min(operationalCount, process.operatorCount);
      
      acc[process.processName] = {
        total: process.machines.length,
        available: operationalCount,
        operators: process.operatorCount,
        effective: effectiveCapacity
      };
      return acc;
    }, {} as Record<string, { total: number; available: number; operators: number; effective: number }>);

  const workloadByProcess: Record<string, number> = {};
  projection.forEach(p => {
    const hours = p.tiempoTotal / 60;
    const key = (p.proceso || '').toLowerCase();
    workloadByProcess[key] = (workloadByProcess[key] || 0) + hours;
  });
  
  const processesOverview = Object.entries(processesInfo)
    .filter(([name]) => name.toLowerCase() !== 'reclasificacion') // Excluir Reclasificacion
    .map(([name, info]) => {
      const availableHours = info.effective * operatorConfig.availableHours;
      const workloadHours = workloadByProcess[name.toLowerCase()] || 0;
      const occupancy = availableHours > 0 ? (workloadHours / availableHours) * 100 : 0;
      return { 
        name, 
        total: info.total, 
        available: info.available, 
        operators: info.operators,
        effective: info.effective,
        availableHours, 
        workloadHours, 
        occupancy 
      };
    });

  // Crear datos para la vista jerárquica
  const createHierarchicalData = () => {
    const processGroups = Object.entries(processesInfo)
      .filter(([processName]) => processName.toLowerCase() !== 'reclasificacion') // Excluir Reclasificacion
      .map(([processName, info]) => {
        const processProjections = projection.filter(p => (p.proceso || '').toLowerCase() === processName.toLowerCase());
        const totalTimeMinutes = processProjections.reduce((sum, p) => sum + p.tiempoTotal, 0);
        const availableHours = info.effective * operatorConfig.availableHours;
        const occupancyPercent = availableHours > 0 ? (totalTimeMinutes / 60) / availableHours * 100 : 0;

      // Agrupar por máquina
      const machineGroups = new Map<string, any>();
      
      processProjections.forEach(p => {
        const key = p.maquina;
        if (!machineGroups.has(key)) {
          machineGroups.set(key, {
            machineId: key,
            machineName: key,
            totalTime: 0,
            occupancy: 0,
            capacity: 0,
            references: []
          });
        }
        
        const machine = machineGroups.get(key);
        machine.totalTime += p.tiempoTotal;
        machine.references.push({
          referencia: p.referencia,
          cantidadRequerida: p.cantidadRequerida,
          sam: p.sam,
          tiempoTotal: p.tiempoTotal,
          ocupacionPorcentaje: p.ocupacionMaquina,
          alerta: p.alerta
        });
      });

      // Calcular ocupación por máquina
      Array.from(machineGroups.values()).forEach(machine => {
        machine.occupancy = machine.totalTime > 0 ? (machine.totalTime / 60) / operatorConfig.availableHours * 100 : 0;
      });

      return {
        processName,
        totalOccupancy: occupancyPercent,
        totalTime: totalTimeMinutes,
        availableHours,
        machines: Array.from(machineGroups.values()),
        effectiveStations: info.effective,
        operators: info.operators
      };
    }).filter(p => p.machines.length > 0 || p.totalTime > 0); // Solo procesos con trabajo asignado

    return processGroups;
  };

  const [viewMode, setViewMode] = useState<'hierarchical' | 'table'>('hierarchical');

  const totalTime = projection.reduce((sum, item) => sum + item.tiempoTotal, 0);
  const processesWithProblems = projection.filter(p => p.alerta && !p.especial).length;
  const specialProcesses = projection.filter(p => p.especial).length;

  if (loading) {
    const elapsedTime = Math.max(0, (Date.now() - startTime) / 1000);
    const progressPercentage = progress.total > 0 ? (progress.current / progress.total) * 100 : 0;
    
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="animate-spin h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <div>
            <p className="text-lg font-medium">Calculando proyección de capacidad...</p>
            <p className="text-sm text-muted-foreground mt-2">
              {progress.currentRef}
            </p>
            <p className="text-xs text-muted-foreground">
              Progreso: {progress.current}/{progress.total}
            </p>
            <div className="w-48 bg-secondary rounded-full h-2 mx-auto mt-3">
              <div 
                className="bg-primary h-2 rounded-full transition-all duration-300" 
                style={{ width: `${Math.min(100, progressPercentage)}%` }}
              ></div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Tiempo transcurrido: {Math.floor(elapsedTime)}s
            </p>
          </div>
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

  // Renderizar vista jerárquica o tabla según el modo
  if (viewMode === 'hierarchical') {
    return (
      <HierarchicalCapacityView
        processGroups={createHierarchicalData()}
        onBack={onBack}
        onStartOver={onStartOver}
      />
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Proyección de Producción con Distribución Inteligente
          </CardTitle>
          <CardDescription>
            Análisis realista con asignación optimizada de máquinas y operarios
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
                {operatorConfig.processes.reduce((sum, p) => sum + p.operatorCount, 0)}
              </div>
              <div className="text-sm text-muted-foreground">Total Operarios</div>
            </div>
            <div className="text-center p-4 bg-muted rounded-lg">
              <div className="text-xl font-bold text-primary">
                {(operatorConfig.processes.reduce((sum, p) => sum + p.operatorCount, 0) * operatorConfig.availableHours).toFixed(0)}h
              </div>
              <div className="text-lg font-medium text-primary">
                {(() => {
                  const currentOperators = operatorConfig.processes.reduce((sum, p) => sum + p.operatorCount, 0);
                  const maxPossibleOperators = operatorConfig.processes.reduce((sum, p) => sum + p.machines.filter(m => m.isOperational).length, 0);
                  const percentage = maxPossibleOperators > 0 ? (currentOperators / maxPossibleOperators) * 100 : 0;
                  return `${percentage.toFixed(1)}%`;
                })()}
              </div>
              <div className="text-sm text-muted-foreground">Capacidad Total</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Resumen General */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Resumen de la Proyección</CardTitle>
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

      {/* Capacidad por Proceso */}
      <Card>
        <CardHeader>
          <CardTitle>Capacidad por Proceso</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Proceso</TableHead>
                  <TableHead>Máquinas</TableHead>
                  <TableHead>Operarios</TableHead>
                  <TableHead>Capacidad Efectiva</TableHead>
                  <TableHead>Horas Disponibles</TableHead>
                  <TableHead>Trabajo Asignado</TableHead>
                  <TableHead>Ocupación</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {processesOverview.map((p) => (
                  <TableRow key={p.name}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>
                      <span className="text-green-600 font-medium">{p.available}</span>
                      <span className="text-muted-foreground">/{p.total}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-blue-600 font-medium">{p.operators}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-primary font-medium">{p.effective}</span>
                      <span className="text-xs text-muted-foreground ml-1">estaciones</span>
                    </TableCell>
                    <TableCell>{p.availableHours.toFixed(1)}h</TableCell>
                    <TableCell>{p.workloadHours.toFixed(1)}h</TableCell>
                    <TableCell>
                      <Badge variant={getCapacityVariant(p.occupancy)}>
                        {p.occupancy.toFixed(1)}%
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Tabla de Proyección */}
      <Card>
        <CardHeader>
          <CardTitle>Proyección Detallada por Referencia</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Referencia</TableHead>
                  <TableHead>Cantidad</TableHead>
                  <TableHead>SAM</TableHead>
                  <TableHead>Tiempo Total</TableHead>
                  <TableHead>Proceso</TableHead>
                  <TableHead>Máquina</TableHead>
                  <TableHead>Estado Máq.</TableHead>
                  <TableHead>Operarios</TableHead>
                  <TableHead>Capacidad</TableHead>
                  <TableHead>Ocupación Máq.</TableHead>
                  <TableHead>Ocupación Proc.</TableHead>
                  <TableHead>Alertas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projection.map((item, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">{item.referencia}</TableCell>
                    <TableCell>{item.cantidadRequerida}</TableCell>
                    <TableCell>{item.sam}</TableCell>
                    <TableCell>{formatTime(item.tiempoTotal)}</TableCell>
                    <TableCell>{item.proceso}</TableCell>
                    <TableCell>{item.maquina}</TableCell>
                    <TableCell>
                      <Badge variant={getStatusVariant(item.estadoMaquina)}>
                        {item.estadoMaquina}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className={
                        item.operadoresDisponibles < item.operadoresRequeridos 
                          ? 'text-red-600' 
                          : 'text-green-600'
                      }>
                        {item.operadoresDisponibles}/{item.operadoresRequeridos}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getCapacityVariant(item.capacidadPorcentaje)}>
                        {item.capacidadPorcentaje.toFixed(1)}%
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getCapacityVariant(item.ocupacionMaquina)}>
                        {item.ocupacionMaquina.toFixed(1)}%
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getCapacityVariant(item.ocupacionProceso)}>
                        {item.ocupacionProceso.toFixed(1)}%
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {item.alerta && (
                        <div
                          className={`text-sm max-w-[240px] truncate ${item.sam === 0 || (item.alerta?.toLowerCase().includes('falta sam') || item.alerta?.toLowerCase().includes('no inscrita')) ? 'text-destructive' : 'text-muted-foreground'}`}
                          title={item.alerta!}
                        >
                          {item.alerta}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button variant="outline" onClick={onBack}>
          Volver
        </Button>
        <Button onClick={onStartOver} className="flex-1">
          Nuevo Análisis
        </Button>
      </div>
    </div>
  );
};