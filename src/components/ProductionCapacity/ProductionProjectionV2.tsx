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

  // Función optimizada para cargar todos los datos BOM con paginación
  const loadAllBomData = async () => {
    console.log('🚀 Cargando todos los datos BOM (con paginación)...');
    const pageSize = 1000;
    let from = 0;
    let to = pageSize - 1;
    let all: any[] = [];

    while (true) {
      const { data: page, error } = await supabase
        .from('bom')
        .select('product_id, component_id, amount')
        .range(from, to);

      if (error) {
        console.error('❌ Error cargando BOM:', error);
        throw error;
      }

      const chunk = page || [];
      all = all.concat(chunk);
      console.log(`   · Página ${from / pageSize + 1}: ${chunk.length} filas`);

      if (chunk.length < pageSize) break; // última página
      from += pageSize;
      to += pageSize;
    }

    setAllBomData(all);
    console.log(`✅ Cargados ${all.length} registros BOM (total acumulado)`);
    return all;
  };

  // Función optimizada para cargar todos los datos de machines_processes con paginación
  const loadAllMachinesProcesses = async () => {
    console.log('🚀 Cargando todos los datos machines_processes (con paginación)...');
    const pageSize = 1000;
    let from = 0;
    let to = pageSize - 1;
    let all: any[] = [];

    while (true) {
      const { data: page, error } = await supabase
        .from('machines_processes')
        .select(`
          sam, frequency, ref, id_machine, id_process,
          machines!inner(id, name, status),
          processes!inner(id, name)
        `)
        .range(from, to);

      if (error) {
        console.error('❌ Error cargando machines_processes:', error);
        throw error;
      }

      const chunk = page || [];
      all = all.concat(chunk);
      console.log(`   · Página ${from / pageSize + 1}: ${chunk.length} filas`);

      if (chunk.length < pageSize) break; // última página
      from += pageSize;
      to += pageSize;
    }

    setAllMachinesProcesses(all);
    console.log(`✅ Cargados ${all.length} registros machines_processes (total acumulado)`);
    return all;
  };

  // Normalización de nombres de proceso y filtros de exclusión
  const normalizeProcessName = (name: string) => {
    if (!name) return name;
    
    const processName = name.trim();
    
    // Procesos excluidos que no deben considerarse en cálculos
    const excludedProcesses = ['reclasificación', 'reclasificacion'];
    if (excludedProcesses.includes(processName.toLowerCase())) {
      return null; // Retornar null para procesos excluidos
    }
    
    // Normalizaciones específicas - Unificar SOLO Despunte y Troquelado
    const normalizations: { [key: string]: string } = {
      'despunte': 'Troquelado / Despunte', // Unificar Despunte con nombre exacto usado en configuración
      'troquelado': 'Troquelado / Despunte', // Normalizar también Troquelado al nombre unificado
      // NO unificar Corte con nada - es un proceso independiente
      'ensambleint': 'EnsambleInt', 
      'roscadoconectores': 'RoscadoConectores'
    };
    
    const lowercaseName = processName.toLowerCase();
    return normalizations[lowercaseName] || processName;
  };

  // Función para determinar si un proceso usa Minutos x Unidad
  const isMinutesPerUnitProcess = (processId: number): boolean => {
    // Minutos x Unidad: Lavado (70), Inyeccion (140), RoscadoConectores (170)
    return processId === 70 || processId === 140 || processId === 170;
  };

  // Resuelve el nombre del proceso usando normalización consistente
  const resolveProcessName = (mp: any) => {
    const original = mp?.processes?.name ?? '';
    const normalized = normalizeProcessName(original);
    
    // Usar siempre el nombre normalizado sin forzar cambios
    // Esto asegura que "Troquelado" y "Despunte" se agrupen como "Troquelado / Despunte"
    return normalized;
  };

  // Función recursiva optimizada con cache
  const getRecursiveBOMOptimized = (
    productId: string, 
    quantity: number = 1, 
    level: number = 0, 
    visited: Set<string> = new Set(),
    bomDataOverride?: any[]
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
    
    // Fuente de datos: preferir override local si existe para evitar races con setState
    const source = bomDataOverride ?? allBomData;

    // Buscar en datos precargados
    const bomItems = source.filter((item: any) => 
      String(item.product_id).trim().toUpperCase() === String(productId).trim().toUpperCase()
    );
    
    console.log(`🔍 Buscando BOM para ${productId}:`, {
      productId: String(productId).trim().toUpperCase(),
      totalBomRecords: source.length,
      foundItems: bomItems.length,
      sampleProductIds: source.slice(0, 5).map((item: any) => item.product_id)
    });
    
    if (bomItems.length === 0) {
      console.log(`⚠️ No se encontraron componentes BOM para ${productId}`);
      // Es un componente final, cachear resultado vacío
      bomCache.set(cacheKey, componentsMap);
      return componentsMap;
    }
    
    console.log(`✅ Encontrados ${bomItems.length} componentes para ${productId}:`, 
      bomItems.map((item: any) => `${item.component_id} (cantidad: ${item.amount})`));
    
    // Procesar cada componente
    for (const bomItem of bomItems) {
      const componentId = String(bomItem.component_id).trim().toUpperCase();
      const componentQuantity = quantity * Number(bomItem.amount);
      
      // Agregar este componente al mapa
      const existingQuantity = componentsMap.get(componentId) || 0;
      componentsMap.set(componentId, existingQuantity + componentQuantity);
      
      // Buscar recursivamente subcomponentes
      const subComponents = getRecursiveBOMOptimized(componentId, componentQuantity, level + 1, new Set(visited), source);
      
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
    setProgress({ current: 0, total: 6, currentRef: 'Cargando datos...' });
    
    try {
      // 1. Cargar todos los datos
      setProgress({ current: 1, total: 6, currentRef: 'Cargando BOM...' });
      const bomData = await loadAllBomData();
      
      setProgress({ current: 2, total: 6, currentRef: 'Cargando procesos...' });
      const machinesData = await loadAllMachinesProcesses();

      // 2. FASE DE CONSOLIDACIÓN: Consolidar componentes evitando duplicación
      setProgress({ current: 3, total: 6, currentRef: 'Consolidando componentes...' });
      const consolidatedComponents = new Map<string, number>();
      const mainReferences = new Map<string, number>();
      
      console.log('\n🔄 === FASE DE CONSOLIDACIÓN (SIN DUPLICACIÓN)===');

      // Procesar cada referencia de entrada
      for (const item of data) {
        console.log(`🔍 Procesando referencia de entrada: ${item.referencia} (cantidad: ${item.cantidad})`);
        
        // Intentar obtener BOM para esta referencia
        const allComponents = getRecursiveBOMOptimized(item.referencia, item.cantidad, 0, new Set(), bomData);
        
        if (allComponents.size > 0) {
          // Si tiene BOM, agregar a referencias principales Y expandir componentes
          const currentMainQty = mainReferences.get(item.referencia) || 0;
          mainReferences.set(item.referencia, currentMainQty + item.cantidad);
          
          // Agregar SOLO los componentes (no la referencia principal)
          for (const [componentId, quantity] of allComponents.entries()) {
            const currentQty = consolidatedComponents.get(componentId) || 0;
            consolidatedComponents.set(componentId, currentQty + quantity);
          }
          console.log(`✅ BOM expandido para ${item.referencia}: ${allComponents.size} componentes (referencia principal incluida en mainReferences)`);
        } else {
          // Si NO tiene BOM, agregar SOLO a componentes consolidados (NO duplicar)
          const currentComponentQty = consolidatedComponents.get(item.referencia) || 0;
          consolidatedComponents.set(item.referencia, currentComponentQty + item.cantidad);
          console.log(`⚠️ No se encontró BOM para ${item.referencia}, usando referencia directa (sin duplicar)`);
        }
      }

      console.log(`✅ Referencias principales consolidadas: ${mainReferences.size}`);
      console.log(`✅ Componentes consolidados: ${consolidatedComponents.size}`);
      
      // Log all available processes from machines_processes
      console.log('\n🔍 === PROCESOS ENCONTRADOS EN BD ===');
      const uniqueProcesses = [...new Set(machinesData.map((mp: any) => mp.processes.name))];
      uniqueProcesses.forEach(processName => {
        const normalized = normalizeProcessName(processName);
        console.log(`   · DB Process: ${processName} -> Normalizado: ${normalized}`);
      });
      
      // Log all configured processes from operatorConfig
      console.log('\n⚙️ === PROCESOS CONFIGURADOS ===');
      operatorConfig.processes.forEach(p => {
        console.log(`   · Configured: ${p.processName} (${p.operatorCount} operarios)`);
      });

      // 3. FASE DE AGRUPACIÓN POR PROCESO: Agrupar por procesos y aplicar distribución inteligente
      setProgress({ current: 4, total: 6, currentRef: 'Agrupando por procesos...' });
      
      const processGroups = new Map<string, {
        processName: string;
        components: Map<string, { quantity: number; sam: number; machineOptions: any[] }>;
        availableOperators: number;
        availableHours: number;
      }>();

      // Incluir referencias principales
      for (const [ref, quantity] of mainReferences.entries()) {
        const machinesProcesses = machinesData.filter((mp: any) => 
          String(mp.ref).trim().toUpperCase() === String(ref).trim().toUpperCase()
        );
        
        for (const mp of machinesProcesses) {
          const processName = resolveProcessName(mp);
          const processNameOriginal = mp.processes.name;
          
          // Saltar procesos excluidos
          if (processName === null) {
            console.log(`     ❌ Proceso excluido: ${processNameOriginal}`);
            continue;
          }
          
          console.log(`     · Proceso original: ${processNameOriginal} -> Normalizado: ${processName}`);
          
          if (!processGroups.has(processName)) {
            const processConfig = operatorConfig.processes.find(p => 
              p.processName.toLowerCase() === processName.toLowerCase()
            );
            
            console.log(`     · Buscando configuración para: "${processName}" -> Encontrado: ${processConfig ? 'SÍ' : 'NO'}`);
            if (!processConfig) {
              console.log(`     · Procesos disponibles:`, operatorConfig.processes.map(p => p.processName));
            }
            
            processGroups.set(processName, {
              processName,
              components: new Map(),
              availableOperators: processConfig?.operatorCount || 0,
              availableHours: processConfig ? operatorConfig.availableHours : 0
            });
          }
          
          const processGroup = processGroups.get(processName)!;
          const existingComponent = processGroup.components.get(ref);
          const availableMachines = machinesProcesses
            .filter((machine: any) => {
              const resolved = resolveProcessName(machine);
              return resolved !== null && resolved.toLowerCase() === processName.toLowerCase();
            })
            .filter((machine: any) => {
              const processConfig = operatorConfig.processes.find(p => 
                p.processName.toLowerCase() === processName.toLowerCase()
              );
              if (!processConfig) {
                console.log(`     ⚠️ No hay configuración para proceso: ${processName}`);
                return false;
              }
              const machineConfig = processConfig.machines.find(m => m.id === machine.id_machine);
              const isOperational = machineConfig?.isOperational || false;
              console.log(`     🔧 Máquina ${machine.machines.name} (ID: ${machine.id_machine}) - Operacional: ${isOperational}`);
              return isOperational;
            });

          if (existingComponent) {
            // No sumar cantidad de nuevo: solo fusionar opciones de máquinas y completar SAM si falta
            if (!existingComponent.sam || existingComponent.sam === 0) {
              const samFromOptions = availableMachines.find((m: any) => m.sam && m.sam > 0)?.sam;
              existingComponent.sam = samFromOptions ?? mp.sam ?? 0;
            }
            const existingNames = new Set(existingComponent.machineOptions.map((m: any) => m.machines.name));
            const merged = [...existingComponent.machineOptions];
            for (const m of availableMachines) if (!existingNames.has(m.machines.name)) merged.push(m);
            existingComponent.machineOptions = merged;
          } else {
            const samForProcess = availableMachines.find((m: any) => m.sam && m.sam > 0)?.sam ?? mp.sam ?? 0;
            processGroup.components.set(ref, {
              quantity,
              sam: samForProcess,
              machineOptions: availableMachines
            });
          }
        }
      }

      // Incluir componentes consolidados
      for (const [componentId, quantity] of consolidatedComponents.entries()) {
        const machinesProcesses = machinesData.filter((mp: any) => 
          String(mp.ref).trim().toUpperCase() === String(componentId).trim().toUpperCase()
        );
        
        for (const mp of machinesProcesses) {
          const processName = resolveProcessName(mp);
          const processNameOriginal = mp.processes.name;
          
          // Saltar procesos excluidos
          if (processName === null) {
            console.log(`     ❌ Proceso excluido: ${processNameOriginal}`);  
            continue;
          }
          
          console.log(`     · Componente ${componentId} - Proceso original: ${processNameOriginal} -> Normalizado: ${processName}`);
          
          if (!processGroups.has(processName)) {
            const processConfig = operatorConfig.processes.find(p => 
              p.processName.toLowerCase() === processName.toLowerCase()
            );
            
            console.log(`     · Buscando configuración para: "${processName}" -> Encontrado: ${processConfig ? 'SÍ' : 'NO'}`);
            if (!processConfig) {
              console.log(`     · Procesos disponibles:`, operatorConfig.processes.map(p => p.processName));
            }
            
            processGroups.set(processName, {
              processName,
              components: new Map(),
              availableOperators: processConfig?.operatorCount || 0,
              availableHours: processConfig ? operatorConfig.availableHours : 0
            });
          }
          
          const processGroup = processGroups.get(processName)!;
          const existingComponent = processGroup.components.get(componentId);
          const availableMachines = machinesProcesses
            .filter((machine: any) => {
              const resolved = resolveProcessName(machine);
              return resolved !== null && resolved.toLowerCase() === processName.toLowerCase();
            })
            .filter((machine: any) => {
              const processConfig = operatorConfig.processes.find(p => 
                p.processName.toLowerCase() === processName.toLowerCase()
              );
              if (!processConfig) {
                console.log(`     ⚠️ No hay configuración para proceso: ${processName}`);
                return false;
              }
              const machineConfig = processConfig.machines.find(m => m.id === machine.id_machine);
              const isOperational = machineConfig?.isOperational || false;
              console.log(`     🔧 Máquina ${machine.machines.name} (ID: ${machine.id_machine}) - Operacional: ${isOperational}`);
              return isOperational;
            });

          if (existingComponent) {
            // No duplicar cantidad: mantener la requerida y fusionar máquinas/SAM
            if (!existingComponent.sam || existingComponent.sam === 0) {
              const samFromOptions = availableMachines.find((m: any) => m.sam && m.sam > 0)?.sam;
              existingComponent.sam = samFromOptions ?? mp.sam ?? 0;
            }
            const existingNames = new Set(existingComponent.machineOptions.map((m: any) => m.machines.name));
            const merged = [...existingComponent.machineOptions];
            for (const m of availableMachines) if (!existingNames.has(m.machines.name)) merged.push(m);
            existingComponent.machineOptions = merged;
          } else {
            const samForProcess = availableMachines.find((m: any) => m.sam && m.sam > 0)?.sam ?? mp.sam ?? 0;
            processGroup.components.set(componentId, {
              quantity,
              sam: samForProcess,
              machineOptions: availableMachines
            });
          }
        }
      }

      // 4. FASE DE DISTRIBUCIÓN INTELIGENTE: Aplicar algoritmo de distribución óptima
      setProgress({ current: 5, total: 6, currentRef: 'Aplicando distribución inteligente...' });
      
      const results: ProjectionInfo[] = [];
      console.log('\n🧠 === APLICANDO DISTRIBUCIÓN INTELIGENTE ===');

      for (const [processName, processGroup] of processGroups.entries()) {
        console.log(`\n🏭 Proceso: ${processName}`);
        console.log(`   Operarios disponibles: ${processGroup.availableOperators}`);
        console.log(`   Componentes a procesar: ${processGroup.components.size}`);

        if (processGroup.components.size === 0) continue;

        // Obtener intersección de máquinas que pueden procesar múltiples componentes
        const machineIntersection = findOptimalMachineDistribution(processGroup);
        console.log(`   Distribución óptima encontrada: ${machineIntersection.length} máquinas`);

        // Distribuir trabajo entre las máquinas seleccionadas
        const workDistribution = distributeWorkAcrossMachines(
          processGroup,
          machineIntersection,
          processName,
          operatorConfig
        );

        results.push(...workDistribution);
      }

      setProgress({ current: 6, total: 6, currentRef: 'Finalizando...' });
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
      const resolvedName = resolveProcessName(mp);
      if (!resolvedName) continue;
      const processConfig = operatorConfig.processes.find(p => 
        p.processName.toLowerCase() === resolvedName.toLowerCase()
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

  // Función para encontrar la distribución óptima de máquinas
  const findOptimalMachineDistribution = (processGroup: {
    processName: string;
    components: Map<string, { quantity: number; sam: number; machineOptions: any[] }>;
    availableOperators: number;
    availableHours: number;
  }) => {
    console.log(`🔍 Buscando distribución óptima para ${processGroup.processName}`);
    
    // Obtener todas las máquinas únicas disponibles para este proceso
    const allMachines = new Map<string, any>();
    
    for (const [componentId, componentData] of processGroup.components.entries()) {
      for (const machine of componentData.machineOptions) {
        if (!allMachines.has(machine.machines.name)) {
          allMachines.set(machine.machines.name, machine);
        }
      }
    }

    const availableMachines = Array.from(allMachines.values());
    console.log(`   Máquinas disponibles: ${availableMachines.map(m => m.machines.name).join(', ')}`);

    // Si tenemos menos operarios que máquinas, seleccionar las mejores máquinas
    if (processGroup.availableOperators < availableMachines.length) {
      console.log(`   Optimizando para ${processGroup.availableOperators} operarios`);
      
      // Calcular score para cada máquina basado en cuántos componentes puede procesar
      const machineScores = availableMachines.map(machine => {
        let score = 0;
        let totalWorkload = 0;
        
        for (const [componentId, componentData] of processGroup.components.entries()) {
          const canProcess = componentData.machineOptions.some(opt => 
            opt.machines.name === machine.machines.name
          );
          if (canProcess) {
            score++;
            // Calcular tiempo de trabajo para este componente
            const isMinutesPerUnitProcess = machine.id_process === 140 || machine.id_process === 170 || 
              machine.processes.name === 'Lavado';
            const timeTotal = isMinutesPerUnitProcess
              ? (componentData.sam > 0 ? componentData.quantity * componentData.sam : 0)
              : (componentData.sam > 0 ? componentData.quantity / componentData.sam : 0);
            totalWorkload += timeTotal / 60; // convertir a horas
          }
        }
        
        return {
          machine,
          score,
          totalWorkload,
          versatility: score / processGroup.components.size // porcentaje de componentes que puede procesar
        };
      });

      // Ordenar por versatilidad (máquinas que pueden procesar más tipos de componentes)
      machineScores.sort((a, b) => b.versatility - a.versatility || b.score - a.score);
      
      console.log('   Scores de máquinas:');
      machineScores.forEach(ms => {
        console.log(`     ${ms.machine.machines.name}: versatilidad=${(ms.versatility * 100).toFixed(1)}%, componentes=${ms.score}, carga=${ms.totalWorkload.toFixed(1)}h`);
      });

      // Seleccionar las mejores máquinas hasta el número de operarios disponibles
      return machineScores.slice(0, processGroup.availableOperators).map(ms => ms.machine);
    }

    return availableMachines;
  };

  // Función para distribuir trabajo entre las máquinas seleccionadas
  const distributeWorkAcrossMachines = (
    processGroup: {
      processName: string;
      components: Map<string, { quantity: number; sam: number; machineOptions: any[] }>;
      availableOperators: number;
      availableHours: number;
    },
    selectedMachines: any[],
    processName: string,
    operatorConfig: OperatorConfig
  ): ProjectionInfo[] => {
    console.log(`🔄 Distribuyendo trabajo en ${processName}`);
    
    const results: ProjectionInfo[] = [];
    const machineWorkloads = new Map<string, number>();
    
    // Inicializar carga de trabajo de máquinas
    selectedMachines.forEach(machine => {
      machineWorkloads.set(machine.machines.name, 0);
    });

    const horasDisponiblesPorOperario = processGroup.availableHours;
    const totalHorasDisponibles = processGroup.availableOperators * horasDisponiblesPorOperario;
    
    // Procesar cada componente
    for (const [componentId, componentData] of processGroup.components.entries()) {
      console.log(`   📦 Distribuyendo ${componentId} (cantidad: ${componentData.quantity})`);
      
      // Encontrar máquinas compatibles entre las seleccionadas
      const compatibleMachines = selectedMachines.filter(machine =>
        componentData.machineOptions.some(opt => opt.machines.name === machine.machines.name)
      );

      if (compatibleMachines.length === 0) {
        console.log(`     ❌ Sin máquinas compatibles para ${componentId}`);
        results.push({
          referencia: componentId,
          cantidadRequerida: componentData.quantity,
          sam: componentData.sam,
          tiempoTotal: 0,
          maquina: 'Sin máquina compatible',
          estadoMaquina: 'No disponible',
          proceso: processName,
          operadoresRequeridos: 1,
          operadoresDisponibles: processGroup.availableOperators,
          capacidadPorcentaje: 0,
          ocupacionMaquina: 0,
          ocupacionProceso: 0,
          alerta: '❌ Sin máquinas compatibles en la distribución óptima'
        });
        continue;
      }

      // Calcular tiempo total requerido para este componente
      const isMinutesPerUnit = isMinutesPerUnitProcess(compatibleMachines[0].id_process);
      const tiempoTotalMinutos = isMinutesPerUnit
        ? (componentData.sam > 0 ? componentData.quantity * componentData.sam : 0)
        : (componentData.sam > 0 ? componentData.quantity / componentData.sam : 0);
      const tiempoTotalHoras = tiempoTotalMinutos / 60;

      console.log(`     ⏱️ Tiempo total requerido: ${tiempoTotalHoras.toFixed(2)}h`);

      // Distribuir trabajo entre máquinas compatibles
      let tiempoRestante = tiempoTotalHoras;
      const distribucionPorMaquina: { machine: any; tiempoAsignado: number; cantidad: number }[] = [];

      // Ordenar máquinas por carga actual (las menos cargadas primero)
      const machinesOrderedByLoad = compatibleMachines.sort((a, b) => {
        const loadA = machineWorkloads.get(a.machines.name) || 0;
        const loadB = machineWorkloads.get(b.machines.name) || 0;
        return loadA - loadB;
      });

      for (let i = 0; i < machinesOrderedByLoad.length && tiempoRestante > 0; i++) {
        const machine = machinesOrderedByLoad[i];
        const currentLoad = machineWorkloads.get(machine.machines.name) || 0;
        const availableCapacity = Math.max(0, horasDisponiblesPorOperario - currentLoad);
        
        const tiempoAsignado = Math.min(tiempoRestante, availableCapacity);
        
        if (tiempoAsignado > 0) {
          // Calcular cantidad proporcional
          const proporcion = tiempoAsignado / tiempoTotalHoras;
          const cantidadAsignada = Math.round(componentData.quantity * proporcion);
          
          distribucionPorMaquina.push({
            machine,
            tiempoAsignado,
            cantidad: cantidadAsignada
          });

          // Actualizar carga de la máquina
          machineWorkloads.set(machine.machines.name, currentLoad + tiempoAsignado);
          tiempoRestante -= tiempoAsignado;
          
          console.log(`     ✅ ${machine.machines.name}: ${cantidadAsignada} unidades, ${tiempoAsignado.toFixed(2)}h`);
        }
      }

      // Crear entradas de resultado para cada distribución
      for (const distribucion of distribucionPorMaquina) {
        const currentMachineLoad = machineWorkloads.get(distribucion.machine.machines.name) || 0;
        const ocupacionMaquina = (currentMachineLoad / horasDisponiblesPorOperario) * 100;
        const contribucionPorcentaje = (distribucion.tiempoAsignado / horasDisponiblesPorOperario) * 100;

        results.push({
          referencia: componentId,
          cantidadRequerida: distribucion.cantidad,
          sam: componentData.sam,
          tiempoTotal: distribucion.tiempoAsignado * 60, // convertir de vuelta a minutos
          maquina: distribucion.machine.machines.name,
          estadoMaquina: distribucion.machine.machines.status,
          proceso: processName,
          operadoresRequeridos: 1,
          operadoresDisponibles: processGroup.availableOperators,
          capacidadPorcentaje: contribucionPorcentaje,
          ocupacionMaquina: ocupacionMaquina,
          ocupacionProceso: (currentMachineLoad / totalHorasDisponibles) * 100,
          alerta: ocupacionMaquina > 100 ? '🔴 Sobrecarga de máquina' : 
                   ocupacionMaquina > 90 ? '⚠️ Capacidad casi al límite' : null
        });
      }

      // Si queda tiempo sin asignar, crear alerta
      if (tiempoRestante > 0.01) { // tolerancia para errores de redondeo
        console.log(`     ⚠️ Tiempo sin asignar: ${tiempoRestante.toFixed(2)}h`);
        results.push({
          referencia: componentId,
          cantidadRequerida: Math.round(componentData.quantity * (tiempoRestante / tiempoTotalHoras)),
          sam: componentData.sam,
          tiempoTotal: tiempoRestante * 60,
          maquina: 'Capacidad insuficiente',
          estadoMaquina: 'Sobrecarga',
          proceso: processName,
          operadoresRequeridos: 1,
          operadoresDisponibles: processGroup.availableOperators,
          capacidadPorcentaje: 0,
          ocupacionMaquina: 0,
          ocupacionProceso: 0,
          alerta: '🔴 Capacidad insuficiente - Requiere más operarios o máquinas'
        });
      }
    }

    return results;
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
    const isMinutesPerUnit = isMinutesPerUnitProcess(bestMachine.id_process);
    const tiempoTotal = isMinutesPerUnit
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
    const processMap = new Map<string, {
      processName: string;
      machines: Map<string, {
        machineId: string;
        machineName: string;
        totalTime: number;
        references: {
          referencia: string;
          cantidadRequerida: number;
          sam: number;
          tiempoTotal: number;
          ocupacionPorcentaje: number;
          alerta?: string;
        }[]
      }>;
      totalTime: number;
      availableHours: number;
      operators: number;
    }>();

    // Consolidar datos por proceso y máquina
    projection.forEach(item => {
      if (!processMap.has(item.proceso)) {
        const processConfig = operatorConfig.processes.find(p => 
          p.processName.toLowerCase() === item.proceso.toLowerCase()
        );
        
        processMap.set(item.proceso, {
          processName: item.proceso,
          machines: new Map(),
          totalTime: 0,
          availableHours: operatorConfig.availableHours,
          operators: processConfig?.operatorCount || 0
        });
      }

      const processGroup = processMap.get(item.proceso)!;
      
      if (!processGroup.machines.has(item.maquina)) {
        processGroup.machines.set(item.maquina, {
          machineId: item.maquina,
          machineName: item.maquina,
          totalTime: 0,
          references: []
        });
      }

      const machineGroup = processGroup.machines.get(item.maquina)!;
      
      // Agregar referencia a la máquina
      machineGroup.references.push({
        referencia: item.referencia,
        cantidadRequerida: item.cantidadRequerida,
        sam: item.sam,
        tiempoTotal: item.tiempoTotal,
        ocupacionPorcentaje: item.capacidadPorcentaje,
        alerta: item.alerta || undefined
      });

      // Actualizar tiempos totales
      machineGroup.totalTime += item.tiempoTotal;
      processGroup.totalTime += item.tiempoTotal;
    });

    // Convertir a formato esperado por HierarchicalCapacityView
    return Array.from(processMap.values()).map(processGroup => {
      const totalAvailableHours = processGroup.operators * processGroup.availableHours * 60; // en minutos
      const totalOccupancy = totalAvailableHours > 0 ? (processGroup.totalTime / totalAvailableHours) * 100 : 0;

      const machines = Array.from(processGroup.machines.values()).map(machine => {
        const machineAvailableTime = processGroup.availableHours * 60; // en minutos
        const machineOccupancy = machineAvailableTime > 0 ? (machine.totalTime / machineAvailableTime) * 100 : 0;

        return {
          machineId: machine.machineId,
          machineName: machine.machineName,
          totalTime: machine.totalTime,
          occupancy: machineOccupancy,
          capacity: machineAvailableTime,
          references: machine.references
        };
      });

      return {
        processName: processGroup.processName,
        totalOccupancy,
        totalTime: processGroup.totalTime,
        availableHours: processGroup.availableHours,
        machines,
        effectiveStations: processGroup.operators,
        operators: processGroup.operators
      };
    }).filter(p => p.machines.length > 0 || p.totalTime > 0); // Solo procesos con trabajo asignado
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