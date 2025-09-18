import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Activity, Calendar, AlertCircle, Database, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { OperatorConfig } from "./OperatorConfiguration";
import HierarchicalCapacityView from './HierarchicalCapacityView';

export interface ProjectionInfo {
  referencia: string;
  jerarquia: string; // Nueva propiedad para mostrar la ruta completa
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
  nivel?: number; // Nivel en la jerarquía BOM
}

interface ProductionProjectionV2Props {
  data: { referencia: string; cantidad: number }[];
  operatorConfig: OperatorConfig;
  onNext: () => void;
  onBack: () => void;
  onProjectionComplete: (projectionData: ProjectionInfo[]) => void;
  onStartOver: () => void;
}

// Cache de datos para optimizar consultas
interface DataCache {
  bomData: Map<string, { component_id: string; amount: number }[]>;
  machinesProcesses: Map<string, {
    sam: number;
    frequency: number;
    id_machine: number;
    id_process: number;
    machines: { id: number; name: string; status: string };
    processes: { id: number; name: string };
  }[]>;
}

interface ComponentNode {
  referencia: string;
  cantidad: number;
  nivel: number;
  padre?: string;
  jerarquia: string;
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
  const [loadingStage, setLoadingStage] = useState<string>('');
  const [progress, setProgress] = useState<number>(0);
  const [cache, setCache] = useState<DataCache>({ bomData: new Map(), machinesProcesses: new Map() });

  useEffect(() => {
    if (data.length > 0) {
      calculateProjection();
    }
  }, [data, operatorConfig]);

  // Función para cargar todos los datos al inicio
  const loadAllData = async (): Promise<DataCache> => {
    setLoadingStage('Cargando datos de BOM...');
    setProgress(10);

    // Cargar toda la tabla BOM
    const { data: bomData, error: bomError } = await supabase
      .from('bom')
      .select('product_id, component_id, amount');
    
    if (bomError) throw bomError;

    setLoadingStage('Cargando procesos y máquinas...');
    setProgress(30);

    // Cargar todos los machines_processes
    const { data: machinesProcessesData, error: mpError } = await supabase
      .from('machines_processes')
      .select(`
        sam, frequency, ref, id_machine, id_process,
        machines!inner(id, name, status),
        processes!inner(id, name)
      `);

    if (mpError) throw mpError;

    setProgress(50);

    // Organizar datos en Maps para búsqueda eficiente
    const bomMap = new Map<string, { component_id: string; amount: number }[]>();
    bomData?.forEach(item => {
      const key = item.product_id.trim().toUpperCase();
      if (!bomMap.has(key)) {
        bomMap.set(key, []);
      }
      bomMap.get(key)!.push({
        component_id: item.component_id.trim().toUpperCase(),
        amount: item.amount
      });
    });

    const machinesProcessesMap = new Map<string, any[]>();
    machinesProcessesData?.forEach(item => {
      const key = item.ref.trim().toUpperCase();
      if (!machinesProcessesMap.has(key)) {
        machinesProcessesMap.set(key, []);
      }
      machinesProcessesMap.get(key)!.push(item);
    });

    console.log(`📊 Cache cargado: ${bomMap.size} productos BOM, ${machinesProcessesMap.size} referencias con procesos`);

    return {
      bomData: bomMap,
      machinesProcesses: machinesProcessesMap
    };
  };

  // Función recursiva optimizada para construir el árbol BOM completo
  const buildBOMTree = (
    productId: string, 
    quantity: number, 
    nivel: number = 0, 
    visited: Set<string> = new Set(),
    parentHierarchy: string = ''
  ): ComponentNode[] => {
    const normalizedId = productId.trim().toUpperCase();
    
    // Prevenir loops infinitos
    if (nivel > 15 || visited.has(normalizedId)) {
      console.warn(`🔄 Loop detectado o nivel máximo alcanzado para ${normalizedId}`);
      return [];
    }
    
    visited.add(normalizedId);
    const components: ComponentNode[] = [];
    
    // Construir jerarquía actual
    const currentHierarchy = parentHierarchy ? `${parentHierarchy} → ${normalizedId}` : normalizedId;
    
    // Buscar componentes en cache
    const bomComponents = cache.bomData.get(normalizedId) || [];
    
    if (bomComponents.length === 0) {
      // Es un componente final
      console.log(`${'  '.repeat(nivel)}📦 ${normalizedId} es componente final`);
      return [];
    }
    
    // Procesar cada componente
    for (const bomItem of bomComponents) {
      const componentId = bomItem.component_id;
      const componentQuantity = quantity * bomItem.amount;
      
      console.log(`${'  '.repeat(nivel)}📋 ${normalizedId} → ${componentId} (cantidad: ${componentQuantity})`);
      
      // Agregar este componente
      components.push({
        referencia: componentId,
        cantidad: componentQuantity,
        nivel: nivel + 1,
        padre: normalizedId,
        jerarquia: `${currentHierarchy} → ${componentId}`
      });
      
      // Buscar recursivamente subcomponentes
      const subComponents = buildBOMTree(
        componentId, 
        componentQuantity, 
        nivel + 1, 
        new Set(visited),
        currentHierarchy
      );
      
      components.push(...subComponents);
    }
    
    return components;
  };

  const calculateProjection = async () => {
    if (!data || data.length === 0) {
      setProjection([]);
      return;
    }

    setLoading(true);
    setError(null);
    setProgress(0);

    try {
      // 1. Cargar todos los datos al inicio
      setLoadingStage('Cargando base de datos...');
      const loadedCache = await loadAllData();
      setCache(loadedCache);

      setLoadingStage('Construyendo árboles BOM...');
      setProgress(60);

      const results: ProjectionInfo[] = [];
      const processWorkload = new Map<string, number>();
      const machineWorkload = new Map<string, number>();

      // Inicializar carga de trabajo para todas las máquinas operativas
      operatorConfig.processes.forEach(process => {
        process.machines
          .filter(m => m.isOperational)
          .forEach(machine => {
            machineWorkload.set(machine.name, 0);
          });
      });

      // 2. Procesar cada referencia principal
      let processedReferences = 0;
      for (const item of data) {
        const mainRef = item.referencia?.trim().toUpperCase();
        setLoadingStage(`Procesando ${mainRef}... (${processedReferences + 1}/${data.length})`);
        setProgress(60 + (processedReferences / data.length) * 35);

        console.log(`\n🎯 === PROCESANDO REFERENCIA PRINCIPAL: ${mainRef} ===`);
        
        // Construir árbol BOM completo
        const bomTree = buildBOMTree(mainRef, item.cantidad);
        
        // Crear lista de todas las referencias a procesar
        const referencesToProcess: ComponentNode[] = [];
        
        // Agregar referencia principal
        referencesToProcess.push({
          referencia: mainRef,
          cantidad: item.cantidad,
          nivel: 0,
          jerarquia: mainRef
        });
        
        // Agregar todos los componentes del BOM
        referencesToProcess.push(...bomTree);

        console.log(`📋 Total referencias a procesar para ${mainRef}: ${referencesToProcess.length}`);

        // 3. Procesar cada componente
        for (const refToProcess of referencesToProcess) {
          await processReference(refToProcess, item.referencia, results, processWorkload, machineWorkload, loadedCache);
        }
        
        processedReferences++;
      }

      setLoadingStage('Finalizando cálculos...');
      setProgress(95);
      
      console.log(`\n🎉 === RESUMEN FINAL ===`);
      console.log(`Total resultados: ${results.length}`);
      console.log(`Referencias con alertas: ${results.filter(r => r.alerta).length}`);
      console.log(`Procesos especiales: ${results.filter(r => r.especial).length}`);
      
      setProjection(results);
      onProjectionComplete(results);
      setProgress(100);
      
    } catch (error) {
      console.error('Error calculating projection:', error);
      setError('Error al calcular la proyección. Verifique la conexión a la base de datos.');
    }
    
    setLoading(false);
  };

  const processReference = async (
    refToProcess: ComponentNode,
    mainReferencia: string,
    results: ProjectionInfo[],
    processWorkload: Map<string, number>,
    machineWorkload: Map<string, number>,
    dataCache: DataCache
  ) => {
    const normalizedRef = refToProcess.referencia.trim().toUpperCase();
    
    // Buscar procesos en cache
    const machinesProcesses = dataCache.machinesProcesses.get(normalizedRef) || [];
    
    if (machinesProcesses.length === 0) {
      // Referencia sin procesos definidos
      results.push({
        referencia: refToProcess.nivel === 0 ? mainReferencia : refToProcess.referencia,
        jerarquia: refToProcess.jerarquia,
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
        alerta: `🔴 Falta SAM para ${normalizedRef} - No inscrita en machines_processes`,
        nivel: refToProcess.nivel
      });
      return;
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
      // No hay máquinas disponibles
      const firstProcess = machinesProcesses[0] as any;
      results.push({
        referencia: refToProcess.nivel === 0 ? mainReferencia : refToProcess.referencia,
        jerarquia: refToProcess.jerarquia,
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
        alerta: '❌ No hay máquinas operativas disponibles',
        nivel: refToProcess.nivel
      });
      return;
    }

    // Seleccionar mejor máquina basado en carga de trabajo y escasez
    const totalMachinesForRef = machinesProcesses.length;
    const availableMachinesCount = availableMachineProcesses.length;
    const scarcityFactor = totalMachinesForRef === 1 ? 1 : (1 / availableMachinesCount);

    let bestMachine: any = null;
    let minWorkload = Infinity;

    for (const mp of availableMachineProcesses) {
      const processConfig = operatorConfig.processes.find(p => p.processName === mp.processes.name);
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

    if (!bestMachine) return;

    // Calcular métricas
    const sam = bestMachine.sam || 0;
    const maquina = bestMachine.machines.name;
    const estadoMaquina = bestMachine.machines.status;
    const proceso = bestMachine.processes.name;

    // Cálculo de tiempo mejorado con manejo de procesos especiales
    const isMinutesPerUnitProcess = ['Inyección', 'RoscadoConectores'].includes(proceso);
    const isSpecialWeightProcess = ['Lavado', 'Pintura', 'Horno'].includes(proceso);
    
    let tiempoTotal = 0;
    let alerta: string | null = null;
    let especial = false;

    if (isSpecialWeightProcess) {
      especial = true;
      alerta = '⚖️ Proceso evaluado por peso - pendiente cálculo específico';
    } else if (isMinutesPerUnitProcess) {
      tiempoTotal = sam > 0 ? refToProcess.cantidad * sam : 0;
    } else {
      tiempoTotal = sam > 0 ? refToProcess.cantidad / sam : 0;
    }

    const tiempoTotalHoras = tiempoTotal / 60;

    // Obtener configuración del proceso y operarios
    const processConfig = operatorConfig.processes.find(p => p.processName === proceso);
    const operadoresDisponibles = processConfig ? processConfig.operatorCount : 0;
    const processRequirements = getProcessRequirements(proceso);
    const operadoresRequeridos = processRequirements.minOperators;

    // Actualizar cargas de trabajo
    const currentMachineWorkload = machineWorkload.get(maquina) || 0;
    const newMachineWorkload = currentMachineWorkload + tiempoTotalHoras;
    machineWorkload.set(maquina, newMachineWorkload);

    const currentProcessWorkload = processWorkload.get(proceso) || 0;
    const newProcessWorkload = currentProcessWorkload + tiempoTotalHoras;
    processWorkload.set(proceso, newProcessWorkload);

    // Calcular ocupaciones
    const horasDisponiblesPorMaquina = operatorConfig.availableHours;
    const horasDisponiblesPorProceso = operatorConfig.availableHours * operadoresDisponibles;
    
    const ocupacionMaquina = (newMachineWorkload / horasDisponiblesPorMaquina) * 100;
    const ocupacionProceso = (newProcessWorkload / horasDisponiblesPorProceso) * 100;

    // Determinar alertas y capacidad
    let capacidadPorcentaje = 0;

    if (!especial) {
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
        
        // Información adicional para casos normales
        if (refToProcess.nivel > 0) {
          alerta = `🔧 Componente de ${mainReferencia}`;
        } else if (availableMachinesCount > 1 && scarcityFactor < 0.5) {
          alerta = `📊 Distribuible en ${availableMachinesCount} máquinas`;
        } else if (availableMachinesCount === 1) {
          alerta = `🎯 Máquina exclusiva para esta referencia`;
        }
      }
    }

    results.push({
      referencia: refToProcess.nivel === 0 ? mainReferencia : refToProcess.referencia,
      jerarquia: refToProcess.jerarquia,
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
      alerta,
      especial,
      nivel: refToProcess.nivel
    });
  };

  const getProcessRequirements = (process: string) => {
    const requirements: { [key: string]: { minOperators: number } } = {
      'punzonado': { minOperators: 2 },
      'corte': { minOperators: 1 },
      'troquelado': { minOperators: 5 },
      'despunte': { minOperators: 5 }, // Nueva configuración para Despunte - usa las mismas máquinas que Troquelado
      'doblez': { minOperators: 4 },
      'soldadura': { minOperators: 3 },
      'mig': { minOperators: 1 },
      'ensambleint': { minOperators: 3 },
      'lavado': { minOperators: 2 }, // Actualizado
      'pintura': { minOperators: 4 },
      'horno': { minOperators: 1 }, // Nuevo
      'ensamble': { minOperators: 9 },
      'inyección': { minOperators: 7 },
      'inyeccion': { minOperators: 7 },
      'tapas': { minOperators: 2 }, // Actualizado
      'interiores': { minOperators: 3 } // Nuevo
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
    .filter(process => process.processName.toLowerCase() !== 'reclasificacion')
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
    .filter(([name]) => name.toLowerCase() !== 'reclasificacion')
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
      .filter(([processName]) => processName.toLowerCase() !== 'reclasificacion')
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
          referencia: p.jerarquia, // Usar jerarquía completa
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
    }).filter(p => p.machines.length > 0 || p.totalTime > 0);

    return processGroups;
  };

  const [viewMode, setViewMode] = useState<'hierarchical' | 'table'>('hierarchical');

  const totalTime = projection.reduce((sum, item) => sum + item.tiempoTotal, 0);
  const processesWithProblems = projection.filter(p => p.alerta && !p.especial && !p.alerta.includes('Componente de') && !p.alerta.includes('Distribuible') && !p.alerta.includes('Máquina exclusiva')).length;
  const specialProcesses = projection.filter(p => p.especial).length;
  const componentsCount = projection.filter(p => p.nivel && p.nivel > 0).length;

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="animate-spin h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <div>
            <p className="text-lg font-medium">{loadingStage}</p>
            <div className="w-64 bg-secondary rounded-full h-3 mx-auto mt-4">
              <div 
                className="bg-primary h-3 rounded-full transition-all duration-300" 
                style={{ width: `${progress}%` }}
              ></div>
            </div>
            <p className="text-sm text-muted-foreground mt-2">{progress.toFixed(0)}% completado</p>
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
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Proyección de Producción - Sistema Reestructurado
          </CardTitle>
          <CardDescription>
            Análisis completo con despliegue BOM jerárquico y asignación optimizada
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Controles de Vista */}
      <Card>
        <CardContent className="p-4">
          <div className="flex gap-2">
            <Button 
              variant={viewMode === 'hierarchical' ? 'default' : 'outline'}
              onClick={() => setViewMode('hierarchical')}
              size="sm"
            >
              Vista Jerárquica
            </Button>
            <Button 
              variant={viewMode === 'table' ? 'default' : 'outline'}
              onClick={() => setViewMode('table')}
              size="sm"
            >
              Vista Tabla
            </Button>
          </div>
        </CardContent>
      </Card>

      {viewMode === 'hierarchical' ? (
        <HierarchicalCapacityView
          processGroups={createHierarchicalData()}
          onBack={onBack}
          onStartOver={onStartOver}
        />
      ) : (
        <>
          {/* Estadísticas del Cache */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Database className="h-5 w-5" />
                Estadísticas del Sistema
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-xl font-bold text-blue-600">{cache.bomData.size}</div>
                  <div className="text-sm text-muted-foreground">Productos BOM</div>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-xl font-bold text-green-600">{cache.machinesProcesses.size}</div>
                  <div className="text-sm text-muted-foreground">Referencias con SAM</div>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-xl font-bold text-purple-600">{componentsCount}</div>
                  <div className="text-sm text-muted-foreground">Componentes Expandidos</div>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-xl font-bold text-primary">{projection.length}</div>
                  <div className="text-sm text-muted-foreground">Total Referencias</div>
                </div>
              </div>
            </CardContent>
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

          {/* Resumen Mejorado */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Clock className="h-5 w-5" />
                Resumen de la Proyección
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-2xl font-bold text-primary">{data.length}</div>
                  <div className="text-sm text-muted-foreground">Referencias Principales</div>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-2xl font-bold text-primary">{projection.length}</div>
                  <div className="text-sm text-muted-foreground">Total Procesos</div>
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

          {/* Tabla de Proyección con Jerarquía */}
          <Card>
            <CardHeader>
              <CardTitle>Proyección Detallada con Jerarquía BOM</CardTitle>
              <CardDescription>
                Muestra el despliegue completo de componentes con su jerarquía
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Jerarquía Completa</TableHead>
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
                      <TableRow key={index} className={item.nivel && item.nivel > 0 ? 'bg-muted/50' : ''}>
                        <TableCell className="font-medium">
                          <div className={`${item.nivel ? `pl-${Math.min(item.nivel * 4, 16)}` : ''}`}>
                            {item.jerarquia}
                          </div>
                        </TableCell>
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
                              className={`text-sm max-w-[240px] truncate ${
                                item.sam === 0 || (item.alerta?.toLowerCase().includes('falta sam') || item.alerta?.toLowerCase().includes('no inscrita')) 
                                  ? 'text-destructive' 
                                  : item.alerta?.includes('🔧') || item.alerta?.includes('📊') || item.alerta?.includes('🎯')
                                    ? 'text-blue-600'
                                    : 'text-muted-foreground'
                              }`}
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
        </>
      )}
    </div>
  );
};