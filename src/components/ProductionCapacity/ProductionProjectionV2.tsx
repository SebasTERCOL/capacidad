import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Activity, Calendar, AlertCircle, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { OperatorConfig } from "./OperatorConfiguration";
import HierarchicalCapacityView from './HierarchicalCapacityView';
import { DeficitInfo, OvertimeConfig } from "./OvertimeConfiguration";

export interface ProjectionInfo {
  referencia: string;
  cantidadRequerida: number;
  cantidadOriginal?: number; // Cantidad original sin descuento de inventario
  inventarioDisponible?: number; // Inventario disponible en products.quantity
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
  /** Datos originales sin ajuste de inventario (productionData crudo) */
  originalData: { referencia: string; cantidad: number }[];
  /** Indica si la proyección actual está usando inventario */
  useInventory: boolean;
  operatorConfig: OperatorConfig;
  overtimeConfig?: OvertimeConfig | null;
  comboData?: any[];
  onNext: () => void;
  onBack: () => void;
  onProjectionComplete: (projectionData: ProjectionInfo[]) => void;
  onDeficitsIdentified?: (deficits: DeficitInfo[]) => void;
  onStartOver: () => void;
}

export const ProductionProjectionV2: React.FC<ProductionProjectionV2Props> = ({ 
  data, 
  originalData,
  useInventory,
  operatorConfig,
  overtimeConfig,
  comboData,
  onNext, 
  onBack, 
  onProjectionComplete,
  onDeficitsIdentified,
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
  }, [data, operatorConfig, overtimeConfig]);

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
          sam, sam_unit, frequency, ref, id_machine, id_process,
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
    
    // UNIFICACIÓN: Troquelado y Despunte comparten operarios
    const lowercaseName = processName.toLowerCase();
    if (lowercaseName === 'troquelado' || lowercaseName === 'despunte') {
      return 'Troquelado / Despunte';
    }
    
    // Normalizaciones específicas - Solo capitalización consistente
    const normalizations: { [key: string]: string } = {
      'inyeccion': 'Inyección',
      'inyección': 'Inyección',
      'roscadoconectores': 'RoscadoConectores',
      'ensambleint': 'EnsambleInt'
    };
    
    return normalizations[lowercaseName] || processName;
  };

  // Normalización de referencias (IDs) para evitar problemas de espacios, guiones, mayúsculas, etc.
  const normalizeRefId = (ref: string) => {
    return String(ref || '')
      .normalize('NFKC')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, ''); // dejar solo alfanuméricos
  };

  // Resuelve el nombre del proceso usando normalización consistente
  const resolveProcessName = (mp: any) => {
    const original = mp?.processes?.name ?? '';
    const normalized = normalizeProcessName(original);
    
    // Mantiene los nombres de procesos separados para análisis independiente
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

    // Normalizar productId para búsqueda
    const productIdNorm = normalizeRefId(productId);
    const productIdUpper = String(productId).trim().toUpperCase();
    
    // Buscar en datos precargados con MÚLTIPLES estrategias de coincidencia
    const bomItems = source.filter((item: any) => {
      const itemProductId = String(item.product_id || '').trim();
      const itemNorm = normalizeRefId(itemProductId);
      const itemUpper = itemProductId.toUpperCase();
      
      // Coincidir por cualquiera de estas variantes
      return itemNorm === productIdNorm || 
             itemUpper === productIdUpper ||
             itemProductId === productId;
    });
    
    // Log solo para referencias específicas para evitar spam
    const isDebugRef = ['CA30', 'CA-30', 'CA35', 'CA-35', 'CA40', 'CA-40'].includes(productId) || 
                       ['CA30', 'CA35', 'CA40'].includes(productIdNorm);
    if (isDebugRef) {
      console.log(`🔍 Buscando BOM para ${productId}:`, {
        productIdNorm,
        productIdUpper,
        totalBomRecords: source.length,
        foundItems: bomItems.length
      });
    }
    
    if (bomItems.length === 0) {
      if (isDebugRef) console.log(`⚠️ No se encontraron componentes BOM para ${productId}`);
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

  const exportToCSV = () => {
    const headers = [
      'Referencia',
      'Cantidad Requerida',
      'SAM',
      'Tiempo Total (min)',
      'Proceso',
      'Máquina',
      'Estado Máquina',
      'Operarios Requeridos',
      'Operarios Disponibles',
      'Capacidad %',
      'Ocupación Máquina %',
      'Ocupación Proceso %',
      'Alertas',
      'Proceso Especial'
    ];

    const rows = projection.map(item => [
      item.referencia,
      item.cantidadRequerida,
      item.sam.toFixed(3),
      item.tiempoTotal.toFixed(2),
      item.proceso,
      item.maquina,
      item.estadoMaquina,
      item.operadoresRequeridos,
      item.operadoresDisponibles,
      item.capacidadPorcentaje.toFixed(1),
      item.ocupacionMaquina.toFixed(1),
      item.ocupacionProceso.toFixed(1),
      item.alerta || '',
      item.especial ? 'Sí' : 'No'
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => 
        typeof cell === 'string' && cell.includes(',') ? `"${cell}"` : cell
      ).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `proyeccion_capacidad_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const calculateProjection = async () => {
    if (!data || data.length === 0) {
      setProjection([]);
      return;
    }

    // 🎛️ LOG CRÍTICO: Verificar que el flag useInventory llega correctamente
    console.log(`\n🎛️ ========================================`);
    console.log(`🎛️ useInventory FLAG: ${useInventory}`);
    console.log(`🎛️ ========================================\n`);

    setLoading(true);
    setError(null);
    setStartTime(Date.now());
    setProgress({ current: 0, total: 6, currentRef: 'Cargando datos...' });
    
    try {
      // 0. Cargar configuración de inventario por proceso desde la tabla 'processes'
      setProgress({ current: 0, total: 7, currentRef: 'Cargando configuración...' });
      const { data: allProcesses } = await supabase
        .from('processes')
        .select('id, name, inventario');
      
      // Procesos donde NO se descuenta inventario (inventario = false)
      const excludedIds = allProcesses?.filter(p => p.inventario === false).map(p => p.id) || [];
      const excludedNames = allProcesses?.filter(p => p.inventario === false).map(p => `${p.name} (${p.id})`).join(', ') || 'Ninguno';
      
      // Procesos donde SÍ se descuenta inventario (inventario = true)
      const inventoryEnabledIds = allProcesses?.filter(p => p.inventario === true).map(p => p.id) || [];
      const inventoryEnabledNames = allProcesses?.filter(p => p.inventario === true).map(p => `${p.name} (${p.id})`).join(', ') || 'Ninguno';
      
      console.log(`🚫 Procesos SIN descuento de inventario (inventario=false): ${excludedNames}`);
      console.log(`✅ Procesos CON descuento de inventario (inventario=true): ${inventoryEnabledNames}`);
      
      // 1. Cargar todos los datos
      setProgress({ current: 1, total: 7, currentRef: 'Cargando BOM...' });
      const bomData = await loadAllBomData();
      
      setProgress({ current: 2, total: 7, currentRef: 'Cargando procesos...' });
      const machinesData = await loadAllMachinesProcesses();

      // 2. FASE DE CONSOLIDACIÓN: Consolidar componentes evitando duplicación
      setProgress({ current: 3, total: 7, currentRef: 'Consolidando componentes...' });
      const consolidatedComponents = new Map<string, number>();
      const mainReferences = new Map<string, number>();

      // Mapas base SIN inventario (siempre usando los datos originales de entrada)
      const baseData = originalData && originalData.length > 0 ? originalData : data;
      const rawMainReferences = new Map<string, number>();
      const rawConsolidatedComponents = new Map<string, number>();

      console.log('\n🔄 === FASE DE CONSOLIDACIÓN (SIN DUPLICACIÓN)===');

      // ===================================================================================
      // INVENTARIO EXHAUSTIVO: Sistema robusto de carga y búsqueda de inventario
      // ===================================================================================
      
      // Mapa principal: almacena inventario indexado por MÚLTIPLES claves para cada referencia
      const inventoryMasterMap = new Map<string, { reference: string; quantity: number }>();
      
      // Cargar inventario real desde products.quantity (SIEMPRE, independiente de useInventory)
      const { data: productsInventory, error: invError } = await supabase
        .from('products')
        .select('reference, quantity');
      
      if (invError) {
        console.error('❌ Error cargando inventario de productos:', invError);
      } else if (productsInventory) {
        console.log(`\n📦 === CARGA EXHAUSTIVA DE INVENTARIO ===`);
        console.log(`   Total productos en BD: ${productsInventory.length}`);
        
        for (const prod of productsInventory) {
          const refOriginal = String(prod.reference || '').trim();
          const qty = prod.quantity || 0;
          
          // Generar MÚLTIPLES claves de búsqueda para cada referencia
          const keys = new Set<string>();
          
          // 1. Referencia original exacta
          keys.add(refOriginal);
          
          // 2. Versión uppercase
          keys.add(refOriginal.toUpperCase());
          
          // 3. Versión lowercase
          keys.add(refOriginal.toLowerCase());
          
          // 4. Versión normalizada (solo alfanuméricos uppercase)
          keys.add(normalizeRefId(refOriginal));
          
          // 5. Versión sin guiones
          keys.add(refOriginal.replace(/-/g, '').toUpperCase());
          
          // 6. Versión sin espacios
          keys.add(refOriginal.replace(/\s/g, '').toUpperCase());
          
          // 7. Versión sin guiones ni espacios
          keys.add(refOriginal.replace(/[-\s]/g, '').toUpperCase());
          
          // Almacenar con cada clave
          for (const key of keys) {
            if (key && key.length > 0) {
              inventoryMasterMap.set(key, { reference: refOriginal, quantity: qty });
            }
          }
        }
        
        console.log(`   Claves de inventario generadas: ${inventoryMasterMap.size}`);
        
        // Verificación exhaustiva de referencias problemáticas
        const testRefs = ['T-CE1515', 'TCE1515', 'T-CE2020', 'TCE2020', 'CUE12D', 'CNCE125-CMB', 'CNCE125CMB', 'CA-30', 'CA30'];
        console.log('\n🔍 === VERIFICACIÓN DE REFERENCIAS CRÍTICAS ===');
        for (const ref of testRefs) {
          const result = inventoryMasterMap.get(ref) || inventoryMasterMap.get(ref.toUpperCase()) || inventoryMasterMap.get(normalizeRefId(ref));
          console.log(`   📦 ${ref}: ${result ? `${result.quantity} unidades (ref: ${result.reference})` : '⚠️ NO ENCONTRADO'}`);
        }
      }
      
      // Función helper EXHAUSTIVA para buscar inventario
      const getInventoryForRef = (ref: string): number => {
        if (!ref) return 0;
        
        const refClean = String(ref).trim();
        
        // Intentar con múltiples variantes de la clave de búsqueda
        const searchKeys = [
          refClean,                                    // Original
          refClean.toUpperCase(),                      // Uppercase
          refClean.toLowerCase(),                      // Lowercase  
          normalizeRefId(refClean),                    // Normalizado (solo alfanuméricos)
          refClean.replace(/-/g, '').toUpperCase(),    // Sin guiones
          refClean.replace(/\s/g, '').toUpperCase(),   // Sin espacios
          refClean.replace(/[-\s]/g, '').toUpperCase() // Sin guiones ni espacios
        ];
        
        for (const key of searchKeys) {
          const result = inventoryMasterMap.get(key);
          if (result !== undefined && result.quantity > 0) {
            return result.quantity;
          }
        }
        
        // Si no encontró con cantidad > 0, buscar cualquier coincidencia
        for (const key of searchKeys) {
          const result = inventoryMasterMap.get(key);
          if (result !== undefined) {
            return result.quantity;
          }
        }
        
        return 0;
      };
      
      console.log(`\n🎛️ useInventory = ${useInventory} (inventario siempre visible, resta condicional)`);
      
      console.log(`🎛️ useInventory = ${useInventory} (el inventario se carga siempre para tooltip, solo la resta es condicional)`);

      // Procesar cada referencia de entrada - SIEMPRE usar cantidad original
      // El descuento de inventario se aplicará a nivel de PROCESO según processes.inventario
      for (const item of data) {
        console.log(`🔍 Procesando referencia de entrada: ${item.referencia} (cantidad: ${item.cantidad})`);
        
        // Usar cantidad original SIN restar inventario aquí
        // El inventario se restará a nivel de proceso si processes.inventario = true
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
          console.log(`✅ BOM expandido para ${item.referencia}: ${allComponents.size} componentes`);
        } else {
          // Si NO tiene BOM, agregar SOLO a componentes consolidados (NO duplicar)
          const currentComponentQty = consolidatedComponents.get(item.referencia) || 0;
          consolidatedComponents.set(item.referencia, currentComponentQty + item.cantidad);
          console.log(`⚠️ No se encontró BOM para ${item.referencia}, usando referencia directa`);
        }
      }

      // Procesar cada referencia usando SIEMPRE los datos originales (sin inventario)
      console.log('\n🔁 === CONSOLIDACIÓN BASE (SIN INVENTARIO) ===');
      for (const item of baseData) {
        console.log(`🔍 Procesando referencia base: ${item.referencia} (cantidad: ${item.cantidad})`);
        const allComponentsBase = getRecursiveBOMOptimized(item.referencia, item.cantidad, 0, new Set(), bomData);

        if (allComponentsBase.size > 0) {
          const currentMainQtyBase = rawMainReferences.get(item.referencia) || 0;
          rawMainReferences.set(item.referencia, currentMainQtyBase + item.cantidad);

          for (const [componentId, quantity] of allComponentsBase.entries()) {
            const currentQtyBase = rawConsolidatedComponents.get(componentId) || 0;
            rawConsolidatedComponents.set(componentId, currentQtyBase + quantity);
          }
        } else {
          const currentComponentQtyBase = rawConsolidatedComponents.get(item.referencia) || 0;
          rawConsolidatedComponents.set(item.referencia, currentComponentQtyBase + item.cantidad);
        }
      }

      console.log(`✅ Referencias principales consolidadas (ajustadas): ${mainReferences.size}`);
      console.log(`✅ Componentes consolidados (ajustados): ${consolidatedComponents.size}`);
      console.log(`✅ Referencias principales base (sin inventario): ${rawMainReferences.size}`);
      console.log(`✅ Componentes base (sin inventario): ${rawConsolidatedComponents.size}`);

      // Consolidar por referencia normalizada para unificar claves como "TAPA12R" y "TAPA 12R"
      const consolidatedByNorm = new Map<string, { quantity: number; display: string }>();
      const rawConsolidatedByNorm = new Map<string, { quantity: number; display: string }>();

      // Consolidar componentes normalizados con logging detallado
      for (const [id, qty] of consolidatedComponents.entries()) {
        const norm = normalizeRefId(id);
        const existing = consolidatedByNorm.get(norm);
        
        // Log detallado para CNCE125-CMB y T-CE1515
        if (norm === 'CNCE125CMB' || norm === 'TCE1515') {
          console.log(`🔍 CONSOLIDANDO ${id} (norm: ${norm}): qty=${qty}, existente=${existing?.quantity ?? 'NO'}`);
        }
        
        if (existing) {
          existing.quantity += qty;
        } else {
          consolidatedByNorm.set(norm, { quantity: qty, display: id });
        }
      }

      for (const [id, qty] of rawConsolidatedComponents.entries()) {
        const norm = normalizeRefId(id);
        const existing = rawConsolidatedByNorm.get(norm);
        
        // Log detallado para CNCE125-CMB y T-CE1515
        if (norm === 'CNCE125CMB' || norm === 'TCE1515') {
          console.log(`🔍 RAW CONSOLIDANDO ${id} (norm: ${norm}): qty=${qty}, existente=${existing?.quantity ?? 'NO'}`);
        }
        
        if (existing) {
          existing.quantity += qty;
        } else {
          rawConsolidatedByNorm.set(norm, { quantity: qty, display: id });
        }
      }

      console.log(`✅ Componentes consolidados normalizados (ajustados): ${consolidatedByNorm.size}`);
      console.log(`✅ Componentes base normalizados (sin inventario): ${rawConsolidatedByNorm.size}`);
      
      // Log valores finales para referencias problemáticas
      const refsCritical = ['CNCE125CMB', 'TCE1515'];
      for (const normRef of refsCritical) {
        const consolidated = consolidatedByNorm.get(normRef);
        const rawConsolidated = rawConsolidatedByNorm.get(normRef);
        console.log(`📊 VALOR FINAL ${normRef}: consolidated=${consolidated?.quantity ?? 'N/A'}, raw=${rawConsolidated?.quantity ?? 'N/A'}`);
      }

      // =====================================================
      // CORRECCIÓN CRÍTICA: Pre-calcular effectiveQuantity por referencia
      // El inventario se resta UNA VEZ por referencia, y esa cantidad efectiva
      // se usa en TODOS los procesos de esa referencia (donde inventario=true)
      // =====================================================
      const effectiveQuantityByRef = new Map<string, number>();
      
      // Referencias problemáticas para diagnóstico (incluimos tanto variantes normalizadas como originales)
      const debugRefs = ['CNCE125CMB', 'CNCE125-CMB', 'TCE1515', 'T-CE1515', 'TCE2020', 'T-CE2020', 'CUE12D', 'CA30', 'CA-30', 'ADAPTER12', 'ADAPTER34', 'CA35', 'CA-35', 'CA40', 'CA-40'];
      
      // Log para verificar el inventario cargado para referencias problemáticas
      console.log('\n📦 === VERIFICACIÓN DE INVENTARIO PARA DEBUGGING ===');
      for (const dbRef of debugRefs) {
        const inv = getInventoryForRef(dbRef);
        console.log(`   📦 ${dbRef}: inventario = ${inv}`);
      }
      
      console.log('\n📊 === PRE-CÁLCULO DE CANTIDADES EFECTIVAS ===');
      
      // Pre-calcular para referencias principales
      for (const [ref, quantity] of mainReferences.entries()) {
        const refNorm = normalizeRefId(ref);
        const inventoryForRef = getInventoryForRef(ref);
        let effectiveQty: number;
        
        if (useInventory && inventoryForRef > 0) {
          effectiveQty = Math.max(0, quantity - inventoryForRef);
        } else {
          effectiveQty = quantity;
        }
        
        effectiveQuantityByRef.set(refNorm, effectiveQty);
        
        // Log detallado para referencias problemáticas
        if (debugRefs.includes(refNorm)) {
          console.log(`🔎 DEBUG MAIN ${ref}: cantidad=${quantity}, inventario=${inventoryForRef}, effectiveQty=${effectiveQty}, useInventory=${useInventory}`);
        }
      }
      
      // Pre-calcular para componentes consolidados
      for (const [normId, entry] of consolidatedByNorm.entries()) {
        const { quantity, display } = entry;
        const inventoryForComp = getInventoryForRef(display);
        let effectiveQty: number;
        
        if (useInventory && inventoryForComp > 0) {
          effectiveQty = Math.max(0, quantity - inventoryForComp);
        } else {
          effectiveQty = quantity;
        }
        
        // Guardar cantidad efectiva (reemplaza si ya existe)
        effectiveQuantityByRef.set(normId, effectiveQty);
        
        // Log detallado para referencias problemáticas
        if (debugRefs.includes(normId)) {
          console.log(`🔎 DEBUG COMP ${display}: cantidad=${quantity}, inventario=${inventoryForComp}, effectiveQty=${effectiveQty}, useInventory=${useInventory}`);
        }
      }
      
      console.log(`✅ Cantidades efectivas pre-calculadas: ${effectiveQuantityByRef.size} referencias`);
      
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
      setProgress({ current: 4, total: 7, currentRef: 'Agrupando por procesos...' });
      
      const processGroups = new Map<string, {
        processName: string;
        components: Map<string, { quantity: number; quantityOriginal: number; inventoryAvailable: number; sam: number; machineOptions: any[] }>;
        availableOperators: number;
        availableHours: number;
      }>();

      // Incluir referencias principales
      console.log('\n🏭 === PROCESANDO REFERENCIAS PRINCIPALES ===');
      console.log(`   Total de referencias principales: ${mainReferences.size}`);
      for (const [ref, qty] of mainReferences.entries()) {
        console.log(`   📋 ${ref}: ${qty} unidades`);
      }
      
      for (const [ref, quantity] of mainReferences.entries()) {
        const refNormalized = normalizeRefId(ref);
        const refUpper = String(ref).trim().toUpperCase();
        
        // Búsqueda flexible en machines_processes
        const machinesProcesses = machinesData.filter((mp: any) => {
          const mpRef = String(mp.ref || '').trim();
          const mpRefNorm = normalizeRefId(mpRef);
          const mpRefUpper = mpRef.toUpperCase();
          
          return mpRefNorm === refNormalized || 
                 mpRefUpper === refUpper ||
                 mpRef === ref;
        });
        
        // Log específico para referencias de Ensamble
        const ensambleProcesses = machinesProcesses.filter((mp: any) => 
          mp.processes.name === 'Ensamble' || mp.processes.name === 'EnsambleInt'
        );
        if (ensambleProcesses.length > 0) {
          console.log(`   🔧 Ref ${ref} tiene ${ensambleProcesses.length} entradas en Ensamble/EnsambleInt`);
        }
        
        // Log detallado para CA-xx que deberían aparecer en Ensamble
        const isEnsambleRef = ['CA30', 'CA35', 'CA40', 'CA50', 'CA60', 'CA70'].includes(refNormalized);
        if (isEnsambleRef) {
          console.log(`\n🏭 === ENSAMBLE DEBUG: ${ref} ===`);
          console.log(`   Normalizada: ${refNormalized}`);
          console.log(`   Procesos encontrados: ${machinesProcesses.length}`);
          console.log(`   Procesos Ensamble: ${ensambleProcesses.length}`);
          if (machinesProcesses.length > 0) {
            console.log(`   Procesos: ${machinesProcesses.map((mp: any) => mp.processes.name).join(', ')}`);
          }
        }
        
        for (const mp of machinesProcesses) {
          const processName = resolveProcessName(mp);
          const processNameOriginal = mp.processes.name;
          const isExcludedProcess = excludedIds.includes(mp.id_process);
          
          // Saltar procesos excluidos por nombre (reclasificación, etc.)
          if (processName === null) {
            console.log(`     ❌ Proceso excluido: ${processNameOriginal}`);
            continue;
          }
          
          // Log especial para Ensamble
          if (processNameOriginal === 'Ensamble' || processNameOriginal === 'EnsambleInt') {
            console.log(`   🏭 ENSAMBLE: ${ref} -> Proceso: ${processNameOriginal} (ID: ${mp.id_process}), Máquina: ${mp.machines.name}`);
          }
          
          console.log(`     · Proceso original: ${processNameOriginal} (ID: ${mp.id_process}) -> Normalizado: ${processName}`);

          // CORRECCIÓN: Usar cantidad efectiva pre-calculada
          // El inventario ya fue descontado UNA VEZ en effectiveQuantityByRef
          // Aquí solo decidimos si usar la cantidad efectiva o la original según processes.inventario
          const refNormalized = normalizeRefId(ref);
          const preCalculatedEffective = effectiveQuantityByRef.get(refNormalized) ?? quantity;
          const inventoryForRef = getInventoryForRef(ref);
          
          // 🔍 LOG DIAGNÓSTICO DETALLADO
          const isDebugRef = debugRefs.includes(refNormalized);
          if (isDebugRef) {
            console.log(`\n🔎 === DEBUG REF PRINCIPAL: ${ref} ===`);
            console.log(`     Normalizada: ${refNormalized}`);
            console.log(`     Cantidad original: ${quantity}`);
            console.log(`     Cantidad efectiva pre-calculada: ${preCalculatedEffective}`);
            console.log(`     Inventario: ${inventoryForRef}`);
            console.log(`     useInventory: ${useInventory}`);
            console.log(`     isExcludedProcess: ${isExcludedProcess}`);
            console.log(`     Proceso: ${processNameOriginal} (ID: ${mp.id_process})`);
          }
          
          let effectiveQuantity: number;
          if (isExcludedProcess) {
            // Proceso con inventario = false: usar cantidad original SIN descuento
            effectiveQuantity = quantity;
            if (isDebugRef) console.log(`     🔒 Proceso ${processNameOriginal} (inventario=false): usando cantidad original = ${quantity}`);
          } else {
            // Proceso con inventario = true: usar cantidad efectiva pre-calculada
            effectiveQuantity = preCalculatedEffective;
            if (isDebugRef) console.log(`     📉 Proceso ${processNameOriginal} (inventario=true): usando cantidad efectiva = ${preCalculatedEffective}`);
          }
          
          if (!processGroups.has(processName)) {
            const processConfig = findProcessConfig(processName, operatorConfig);
            
            console.log(`     · Buscando configuración para: "${processName}" -> Encontrado: ${processConfig ? 'SÍ' : 'NO'}`);
            if (!processConfig) {
              console.log(`     · Procesos disponibles:`, operatorConfig.processes.map(p => p.processName));
            }
            
            processGroups.set(processName, {
              processName,
              components: new Map(),
              availableOperators: processConfig?.operatorCount || 0,
              availableHours: processConfig?.availableHours || operatorConfig.availableHours
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
              const processConfig = findProcessConfig(processName, operatorConfig);
              if (!processConfig) {
                // Incluir máquina aunque el proceso no esté configurado (aparecerá con 0 operarios)
                console.log(`     ⚠️ Proceso ${processName} sin configuración - incluyendo máquina ${machine.machines.name} para mostrar tiempo requerido`);
                return true;
              }
              const machineConfig = processConfig.machines.find(m => m.id === machine.id_machine);
              const isOperational = machineConfig?.isOperational || false;
              console.log(`     🔧 Máquina ${machine.machines.name} (ID: ${machine.id_machine}) - Operacional: ${isOperational}`);
              return isOperational;
            });

          // Obtener valores originales desde rawMainReferences
          const quantityOriginalFromRaw = rawMainReferences.get(ref) || quantity;
          const inventoryAvailableFromDB = getInventoryForRef(ref);
          
          if (existingComponent) {
            // Actualizar cantidad con efectivo (incluye descuento de inventario si aplica)
            existingComponent.quantity = effectiveQuantity;
            // CRÍTICO: También actualizar quantityOriginal e inventoryAvailable
            existingComponent.quantityOriginal = quantityOriginalFromRaw;
            existingComponent.inventoryAvailable = inventoryAvailableFromDB;
            if (!existingComponent.sam || existingComponent.sam === 0) {
              const samFromOptions = availableMachines.find((m: any) => m.sam && m.sam > 0)?.sam;
              existingComponent.sam = samFromOptions ?? mp.sam ?? 0;
            }
            const existingNames = new Set(existingComponent.machineOptions.map((m: any) => m.machines.name));
            const merged = [...existingComponent.machineOptions];
            for (const m of availableMachines) if (!existingNames.has(m.machines.name)) merged.push(m);
            existingComponent.machineOptions = merged;
            
            if (isDebugRef) {
              console.log(`     🔄 Componente existente actualizado: quantity=${effectiveQuantity}, quantityOriginal=${quantityOriginalFromRaw}, inventoryAvailable=${inventoryAvailableFromDB}`);
            }
          } else {
            const samForProcess = availableMachines.find((m: any) => m.sam && m.sam > 0)?.sam ?? mp.sam ?? 0;
            processGroup.components.set(ref, {
              quantity: effectiveQuantity,
              quantityOriginal: quantityOriginalFromRaw,
              inventoryAvailable: inventoryAvailableFromDB,
              sam: samForProcess,
              machineOptions: availableMachines
            });
            
            if (isDebugRef) {
              console.log(`     ➕ Nuevo componente creado: quantity=${effectiveQuantity}, quantityOriginal=${quantityOriginalFromRaw}, inventoryAvailable=${inventoryAvailableFromDB}`);
            }
          }
        }
      }

      // Incluir componentes consolidados (normalizados)
      for (const [normId, entry] of consolidatedByNorm.entries()) {
        const { quantity, display } = entry;
        const displayUpper = String(display).trim().toUpperCase();
        
        // Búsqueda flexible en machines_processes
        const machinesProcesses = machinesData.filter((mp: any) => {
          const mpRef = String(mp.ref || '').trim();
          const mpRefNorm = normalizeRefId(mpRef);
          const mpRefUpper = mpRef.toUpperCase();
          
          return mpRefNorm === normId || 
                 mpRefUpper === displayUpper ||
                 mpRef === display;
        });
        
        for (const mp of machinesProcesses) {
          const processName = resolveProcessName(mp);
          const processNameOriginal = mp.processes.name;
          const isExcludedProcess = excludedIds.includes(mp.id_process);
          
          // Saltar procesos excluidos
          if (processName === null) {
            console.log(`     ❌ Proceso excluido: ${processNameOriginal}`);  
            continue;
          }
          
          console.log(`     · Componente ${display} - Proceso original: ${processNameOriginal} (ID: ${mp.id_process}) -> Normalizado: ${processName}`);
          
          if (!processGroups.has(processName)) {
            const processConfig = findProcessConfig(processName, operatorConfig);
            
            console.log(`     · Buscando configuración para: "${processName}" -> Encontrado: ${processConfig ? 'SÍ' : 'NO'}`);
            if (!processConfig) {
              console.log(`     · Procesos disponibles:`, operatorConfig.processes.map(p => p.processName));
            }
            
            processGroups.set(processName, {
              processName,
              components: new Map(),
              availableOperators: processConfig?.operatorCount || 0,
              availableHours: processConfig?.availableHours || operatorConfig.availableHours
            });
          }
          
          const processGroup = processGroups.get(processName)!;
          const existingComponent = processGroup.components.get(display);
          const availableMachines = machinesProcesses
            .filter((machine: any) => {
              const resolved = resolveProcessName(machine);
              return resolved !== null && resolved.toLowerCase() === processName.toLowerCase();
            })
            .filter((machine: any) => {
              const processConfig = findProcessConfig(processName, operatorConfig);
              if (!processConfig) {
                // Incluir máquina aunque el proceso no esté configurado (aparecerá con 0 operarios)
                console.log(`     ⚠️ Proceso ${processName} sin configuración - incluyendo máquina ${machine.machines.name} para mostrar tiempo requerido`);
                return true;
              }
              const machineConfig = processConfig.machines.find(m => m.id === machine.id_machine);
              const isOperational = machineConfig?.isOperational || false;
              console.log(`     🔧 Máquina ${machine.machines.name} (ID: ${machine.id_machine}) - Operacional: ${isOperational}`);
              return isOperational;
            });

          // CORRECCIÓN: Usar cantidad efectiva pre-calculada
          // El inventario ya fue descontado UNA VEZ en effectiveQuantityByRef
          const preCalculatedEffective = effectiveQuantityByRef.get(normId) ?? quantity;
          const inventoryForComponent = getInventoryForRef(display);
          
          // 🔍 LOG DIAGNÓSTICO DETALLADO PARA COMPONENTES
          const isDebugComp = debugRefs.includes(normId);
          if (isDebugComp) {
            console.log(`\n🔎 === DEBUG COMPONENTE: ${display} ===`);
            console.log(`     Normalizada: ${normId}`);
            console.log(`     Cantidad original: ${quantity}`);
            console.log(`     Cantidad efectiva pre-calculada: ${preCalculatedEffective}`);
            console.log(`     Inventario: ${inventoryForComponent}`);
            console.log(`     useInventory: ${useInventory}`);
            console.log(`     isExcludedProcess: ${isExcludedProcess}`);
            console.log(`     Proceso: ${processNameOriginal} (ID: ${mp.id_process})`);
          }
          
          let effectiveQuantity: number;
          if (isExcludedProcess) {
            // Proceso con inventario = false: usar cantidad original SIN descuento
            effectiveQuantity = quantity;
            if (isDebugComp) console.log(`     🔒 Componente en ${processNameOriginal} (inventario=false): usando cantidad original = ${quantity}`);
          } else {
            // Proceso con inventario = true: usar cantidad efectiva pre-calculada
            effectiveQuantity = preCalculatedEffective;
            if (isDebugComp) console.log(`     📉 Componente en ${processNameOriginal} (inventario=true): usando cantidad efectiva = ${preCalculatedEffective}`);
          }

          // Obtener valores originales desde rawConsolidatedByNorm
          const rawEntry = rawConsolidatedByNorm.get(normId);
          const quantityOriginalFromRaw = rawEntry?.quantity || quantity;
          const inventoryAvailableFromDB = getInventoryForRef(display);
          
          if (existingComponent) {
            // Actualizar cantidad con efectivo (incluye descuento de inventario si aplica)
            existingComponent.quantity = effectiveQuantity;
            // CRÍTICO: También actualizar quantityOriginal e inventoryAvailable
            existingComponent.quantityOriginal = quantityOriginalFromRaw;
            existingComponent.inventoryAvailable = inventoryAvailableFromDB;
            if (!existingComponent.sam || existingComponent.sam === 0) {
              const samFromOptions = availableMachines.find((m: any) => m.sam && m.sam > 0)?.sam;
              existingComponent.sam = samFromOptions ?? mp.sam ?? 0;
            }
            const existingNames = new Set(existingComponent.machineOptions.map((m: any) => m.machines.name));
            const merged = [...existingComponent.machineOptions];
            for (const m of availableMachines) if (!existingNames.has(m.machines.name)) merged.push(m);
            existingComponent.machineOptions = merged;
            
            if (isDebugComp) {
              console.log(`     🔄 Componente existente actualizado: quantity=${effectiveQuantity}, quantityOriginal=${quantityOriginalFromRaw}, inventoryAvailable=${inventoryAvailableFromDB}`);
            }
          } else {
            const samForProcess = availableMachines.find((m: any) => m.sam && m.sam > 0)?.sam ?? mp.sam ?? 0;
            processGroup.components.set(display, {
              quantity: effectiveQuantity,
              quantityOriginal: quantityOriginalFromRaw,
              inventoryAvailable: inventoryAvailableFromDB,
              sam: samForProcess,
              machineOptions: availableMachines
            });
            
            if (isDebugComp) {
              console.log(`     ➕ Nuevo componente creado: quantity=${effectiveQuantity}, quantityOriginal=${quantityOriginalFromRaw}, inventoryAvailable=${inventoryAvailableFromDB}`);
            }
          }
        }
      }

      // 3.5. INTEGRACIÓN DE COMBOS: Agregar combos seleccionados al proceso PUNZONADO
      if (comboData && comboData.length > 0) {
        console.log('\n🎯 === INTEGRANDO COMBOS AL ANÁLISIS ===');
        setProgress({ current: 5, total: 7, currentRef: 'Integrando combos...' });
        
        for (const combo of comboData) {
          // Saltar combos con cantidad 0
          if (combo.suggestedCombos === 0) {
            console.log(`⏭️ Saltando combo ${combo.comboName} (cantidad 0)`);
            continue;
          }

          console.log(`\n📦 Procesando combo: ${combo.comboName}`);
          console.log(`   · Cantidad de combos: ${combo.suggestedCombos}`);
          console.log(`   · Tiempo de ciclo: ${combo.cycleTime} min/combo`);
          console.log(`   · Tiempo total: ${combo.totalTime} min (ya calculado)`);
          
          // Buscar la información del combo en machines_processes
          const comboMachineProcesses = machinesData.filter((mp: any) => 
            normalizeRefId(mp.ref) === normalizeRefId(combo.comboName) &&
            mp.id_process === 20 // PUNZONADO
          );
          
          if (comboMachineProcesses.length === 0) {
            console.warn(`⚠️ No se encontró información de proceso para combo ${combo.comboName}`);
            continue;
          }
          
          const comboMp = comboMachineProcesses[0];
          const processName = resolveProcessName(comboMp);
          const processNameOriginal = comboMp.processes.name;
          
          // Saltar procesos excluidos
          if (processName === null) {
            console.log(`     ❌ Proceso excluido: ${processNameOriginal}`);
            continue;
          }
          
          console.log(`     · Proceso: ${processName}`);
          
          // Crear o obtener el grupo de proceso
          if (!processGroups.has(processName)) {
            const processConfig = findProcessConfig(processName, operatorConfig);
            
            if (!processConfig) {
              console.log(`     · Procesos disponibles:`, operatorConfig.processes.map(p => p.processName));
            }
            
            processGroups.set(processName, {
              processName,
              components: new Map(),
              availableOperators: processConfig?.operatorCount || 0,
              availableHours: processConfig?.availableHours || operatorConfig.availableHours
            });
          }
          
          const processGroup = processGroups.get(processName)!;
          
          // Obtener máquinas operacionales para este combo
          const availableMachines = comboMachineProcesses
            .filter((machine: any) => {
              const resolved = resolveProcessName(machine);
              return resolved !== null && resolved.toLowerCase() === processName.toLowerCase();
            })
            .filter((machine: any) => {
              const processConfig = findProcessConfig(processName, operatorConfig);
              if (!processConfig) {
                console.log(`     ⚠️ No hay configuración para proceso: ${processName}`);
                return false;
              }
              const machineConfig = processConfig.machines.find(m => m.id === machine.id_machine);
              const isOperational = machineConfig?.isOperational || false;
              console.log(`     🔧 Máquina ${machine.machines.name} (ID: ${machine.id_machine}) - Operacional: ${isOperational}`);
              return isOperational;
            });
          
          // Agregar el combo como un componente en el proceso
          const existingComponent = processGroup.components.get(combo.comboName);
          
          if (existingComponent) {
            // Si ya existe, actualizar la información
            if (!existingComponent.sam || existingComponent.sam === 0) {
              existingComponent.sam = combo.cycleTime;
            }
            const existingNames = new Set(existingComponent.machineOptions.map((m: any) => m.machines.name));
            const merged = [...existingComponent.machineOptions];
            for (const m of availableMachines) {
              if (!existingNames.has(m.machines.name)) {
                // Asegurar que el sam_unit sea 'min_per_unit' para combos
                merged.push({
                  ...m,
                  sam: combo.cycleTime,
                  sam_unit: 'min_per_unit' // ⚡ CRÍTICO: Los combos usan minutos por combo
                });
              }
            }
            existingComponent.machineOptions = merged;
            existingComponent.quantity = combo.suggestedCombos; // Actualizar con la cantidad de combos
          } else {
            // Asegurar que todas las máquinas tengan el sam_unit correcto
            const machinesWithCorrectUnit = availableMachines.map(m => ({
              ...m,
              sam: combo.cycleTime,
              sam_unit: 'min_per_unit' // ⚡ CRÍTICO: Los combos usan minutos por combo
            }));

            processGroup.components.set(combo.comboName, {
              quantity: combo.suggestedCombos, // Número de combos a realizar
              quantityOriginal: combo.suggestedCombos, // Para combos, es lo mismo
              inventoryAvailable: 0, // Combos no tienen inventario
              sam: combo.cycleTime, // Tiempo por combo en minutos
              machineOptions: machinesWithCorrectUnit
            });
          }
          
          console.log(`✅ Combo ${combo.comboName} agregado al proceso ${processName}`);
          console.log(`   · Tiempo por combo: ${combo.cycleTime} min (sam_unit: min_per_unit)`);
          console.log(`   · Tiempo total: ${combo.suggestedCombos * combo.cycleTime} min = ${(combo.suggestedCombos * combo.cycleTime / 60).toFixed(2)}h`);
          console.log(`   · Tiempo total guardado: ${combo.totalTime} min`);
        }
      }

      // =====================================================
      // CORRECCIÓN: Asegurar que TODOS los procesos configurados aparezcan
      // Incluso si no tienen componentes asignados (mostrarán 0% ocupación)
      // =====================================================
      console.log('\n🔄 === VERIFICANDO PROCESOS CONFIGURADOS ===');
      for (const processConfig of operatorConfig.processes) {
        const processName = processConfig.processName;
        if (!processGroups.has(processName)) {
          console.log(`   ⚠️ Proceso ${processName} configurado pero sin componentes - agregando al análisis`);
          processGroups.set(processName, {
            processName,
            components: new Map(),
            availableOperators: processConfig.operatorCount || 0,
            availableHours: processConfig.availableHours || operatorConfig.availableHours
          });
        } else {
          console.log(`   ✅ Proceso ${processName} ya tiene componentes asignados`);
        }
      }

      // 4. FASE DE DISTRIBUCIÓN INTELIGENTE: Aplicar algoritmo de distribución óptima
      setProgress({ current: 6, total: 7, currentRef: 'Aplicando distribución inteligente...' });
      
      const results: ProjectionInfo[] = [];
      console.log('\n🧠 === APLICANDO DISTRIBUCIÓN INTELIGENTE ===');

      for (const [processName, processGroup] of processGroups.entries()) {
        console.log(`\n🏭 Proceso: ${processName}`);
        console.log(`   Operarios disponibles: ${processGroup.availableOperators}`);
        console.log(`   Componentes a procesar: ${processGroup.components.size}`);

        // Aunque no tenga componentes, agregar al resultado con 0% ocupación
        if (processGroup.components.size === 0) {
          console.log(`   ℹ️ Proceso ${processName} sin componentes - mostrando con 0% ocupación`);
          // Agregar entrada vacía para que el proceso aparezca en la vista
          results.push({
            referencia: `(Sin referencias asignadas)`,
            cantidadRequerida: 0,
            cantidadOriginal: 0,
            inventarioDisponible: 0,
            sam: 0,
            tiempoTotal: 0,
            maquina: '-',
            estadoMaquina: '-',
            proceso: processName,
            operadoresRequeridos: 0,
            operadoresDisponibles: processGroup.availableOperators,
            capacidadPorcentaje: 0,
            ocupacionMaquina: 0,
            ocupacionProceso: 0,
            alerta: 'ℹ️ Sin referencias asignadas a este proceso'
          });
          continue;
        }

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

      setProgress({ current: 7, total: 7, currentRef: 'Finalizando...' });
      setProjection(results);
      onProjectionComplete(results);
      
    } catch (error) {
      console.error('Error calculating projection:', error);
      setError('Error al calcular la proyección. Verifique la conexión a la base de datos.');
    }
    
    setLoading(false);
    setProgress({ current: 0, total: 0, currentRef: '' });
  };

  // Función helper para determinar prioridad de pintura (PPOLVO1 vs PPOLVO3)
  // Prioridad 1: Referencias que usan PPOLVO1 (máxima prioridad)
  // Prioridad 2: Referencias que usan PPOLVO3 (producir después si hay tiempo sobrante)
  // Prioridad 0: Sin prioridad especial
  const getPaintPriority = (ref: string, bomData: any[]): number => {
    const refNormalized = normalizeRefId(ref);
    
    // Buscar en BOM si la referencia usa PPOLVO1 o PPOLVO3 como componente
    const usesPolvo1 = bomData.some(b => 
      normalizeRefId(b.product_id) === refNormalized && 
      normalizeRefId(b.component_id) === 'PPOLVO1'
    );
    const usesPolvo3 = bomData.some(b => 
      normalizeRefId(b.product_id) === refNormalized && 
      normalizeRefId(b.component_id) === 'PPOLVO3'
    );
    
    if (usesPolvo1) return 1; // Prioridad alta - producir primero
    if (usesPolvo3) return 2; // Prioridad baja - producir después
    return 0; // Sin prioridad especial
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
      const processConfig = findProcessConfig(resolvedName, operatorConfig);
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
            // Calcular tiempo de trabajo para este componente usando sam_unit
            const isMinutesPerUnit = machine.sam_unit === 'min_per_unit';
            const timeTotal = isMinutesPerUnit
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
      components: Map<string, { quantity: number; quantityOriginal: number; inventoryAvailable: number; sam: number; machineOptions: any[] }>;
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

    // Obtener el factor de eficiencia del proceso
    const processConfig = findProcessConfig(processName, operatorConfig);
    const efficiencyFactor = (processConfig?.efficiency || 100) / 100;
    
    // Aplicar el factor de eficiencia a las horas disponibles
    const horasDisponiblesPorOperario = processGroup.availableHours * efficiencyFactor;
    const totalHorasDisponibles = processGroup.availableOperators * horasDisponiblesPorOperario;
    
    // Calcular horas extras totales disponibles para este proceso
    let totalHorasExtrasDisponibles = 0;
    if (overtimeConfig) {
      const processOvertimeConfig = overtimeConfig.processes.find(
        p => p.processName === processName
      );
      if (processOvertimeConfig && processOvertimeConfig.enabled) {
        processOvertimeConfig.machines.forEach(m => {
          if (m.enabled && m.additionalCapacity > 0) {
            totalHorasExtrasDisponibles += m.additionalCapacity / 60; // convertir a horas
          }
        });
      }
    }
    
    const totalHorasConExtras = totalHorasDisponibles + totalHorasExtrasDisponibles;
    
    console.log(`   📊 Eficiencia del proceso: ${(efficiencyFactor * 100).toFixed(1)}%`);
    console.log(`   ⏱️ Horas base por operario: ${processGroup.availableHours.toFixed(2)}h`);
    console.log(`   ⏱️ Horas efectivas por operario (con eficiencia): ${horasDisponiblesPorOperario.toFixed(2)}h`);
    console.log(`   ⏱️ Total horas disponibles (base): ${totalHorasDisponibles.toFixed(2)}h`);
    console.log(`   ⏰ Total horas extras disponibles: ${totalHorasExtrasDisponibles.toFixed(2)}h`);
    console.log(`   ⏱️ Total horas con extras: ${totalHorasConExtras.toFixed(2)}h`);
    
    // Ordenar componentes: Para proceso Pintura, priorizar PPOLVO1 sobre PPOLVO3
    let componentsToProcess = Array.from(processGroup.components.entries());
    
    if (processName.toLowerCase() === 'pintura') {
      console.log(`   🎨 Proceso PINTURA detectado - aplicando prioridad PPOLVO1 > PPOLVO3`);
      
      componentsToProcess.sort((a, b) => {
        const priorityA = getPaintPriority(a[0], allBomData);
        const priorityB = getPaintPriority(b[0], allBomData);
        
        // Prioridad 1 (PPOLVO1) viene primero, luego prioridad 2 (PPOLVO3), luego prioridad 0
        if (priorityA === 1 && priorityB !== 1) return -1;
        if (priorityB === 1 && priorityA !== 1) return 1;
        if (priorityA === 2 && priorityB === 0) return -1;
        if (priorityB === 2 && priorityA === 0) return 1;
        return 0;
      });
      
      // Log de orden de procesamiento
      console.log(`   📋 Orden de procesamiento para Pintura:`);
      componentsToProcess.forEach(([id], idx) => {
        const priority = getPaintPriority(id, allBomData);
        const priorityLabel = priority === 1 ? 'PPOLVO1' : priority === 2 ? 'PPOLVO3' : 'OTRO';
        console.log(`      ${idx + 1}. ${id} (${priorityLabel})`);
      });
    }

    // Procesar cada componente (ya ordenados por prioridad si es Pintura)
    for (const [componentId, componentData] of componentsToProcess) {
      console.log(`   📦 Distribuyendo ${componentId} (cantidad: ${componentData.quantity})`);
      
      // Encontrar máquinas compatibles entre las seleccionadas
      const compatibleMachines = selectedMachines.filter(machine =>
        componentData.machineOptions.some(opt => opt.machines.name === machine.machines.name)
      );

      if (compatibleMachines.length === 0) {
        console.log(`     ⚠️ Sin máquinas compatibles entre las seleccionadas para ${componentId}`);
        
        // Verificar si hay máquinas compatibles en TODAS las opciones disponibles
        const allCompatibleMachines = componentData.machineOptions;
        
        if (allCompatibleMachines.length > 0) {
          console.log(`     ℹ️ Hay ${allCompatibleMachines.length} máquinas compatibles disponibles, buscando capacidad sobrante...`);
          
          // Encontrar la máquina seleccionada con menor ocupación
          let machineWithLowestLoad = selectedMachines[0];
          let lowestLoad = machineWorkloads.get(machineWithLowestLoad.machines.name) || 0;
          
          for (const machine of selectedMachines) {
            const currentLoad = machineWorkloads.get(machine.machines.name) || 0;
            if (currentLoad < lowestLoad) {
              lowestLoad = currentLoad;
              machineWithLowestLoad = machine;
            }
          }
          
          const ocupacionActual = (lowestLoad / horasDisponiblesPorOperario) * 100;
          const capacidadDisponible = horasDisponiblesPorOperario - lowestLoad;
          
          console.log(`     ✅ Máquina con menor carga: ${machineWithLowestLoad.machines.name} (${ocupacionActual.toFixed(1)}% ocupada, ${capacidadDisponible.toFixed(2)}h disponibles)`);
          
          // Usar los datos de SAM de la máquina compatible original
          const compatibleMachineData = allCompatibleMachines[0];
          const isMinutesPerUnit = compatibleMachineData.sam_unit === 'min_per_unit';
          const tiempoTotalMinutos = isMinutesPerUnit
            ? (componentData.sam > 0 ? componentData.quantity * componentData.sam : 0)
            : (componentData.sam > 0 ? componentData.quantity / componentData.sam : 0);
          const tiempoTotalHoras = tiempoTotalMinutos / 60;
          
          // Verificar si hay suficiente capacidad disponible
          if (capacidadDisponible >= tiempoTotalHoras) {
            // Actualizar carga de la máquina compatible (no la que presta el operario)
            const cargaActualCompatible = machineWorkloads.get(compatibleMachineData.machines.name) || 0;
            machineWorkloads.set(compatibleMachineData.machines.name, cargaActualCompatible + tiempoTotalHoras);
            
            const ocupacionMaquinaNueva = ((lowestLoad + tiempoTotalHoras) / horasDisponiblesPorOperario) * 100;
            const ocupacionProceso = (tiempoTotalHoras / totalHorasDisponibles) * 100;
            
            results.push({
              referencia: componentId,
              cantidadRequerida: componentData.quantity,
              cantidadOriginal: componentData.quantityOriginal,
              inventarioDisponible: componentData.inventoryAvailable,
              sam: componentData.sam,
              tiempoTotal: tiempoTotalMinutos,
              maquina: compatibleMachineData.machines.name,
              estadoMaquina: compatibleMachineData.machines.estado,
              proceso: processName,
              operadoresRequeridos: 1,
              operadoresDisponibles: processGroup.availableOperators,
              capacidadPorcentaje: (tiempoTotalHoras / horasDisponiblesPorOperario) * 100,
              ocupacionMaquina: (cargaActualCompatible + tiempoTotalHoras) / horasDisponiblesPorOperario * 100,
              ocupacionProceso: ocupacionProceso,
              alerta: `ℹ️ Usando capacidad sobrante de ${machineWithLowestLoad.machines.name} (${ocupacionActual.toFixed(1)}% ocupado)`
            });
            
            console.log(`     ✅ Asignado a ${machineWithLowestLoad.machines.name} usando capacidad sobrante`);
            continue;
          } else {
            console.log(`     ❌ Capacidad insuficiente. Requerido: ${tiempoTotalHoras.toFixed(2)}h, Disponible: ${capacidadDisponible.toFixed(2)}h`);
          }
        }
        
        // Si no se pudo asignar, mostrar error
        console.log(`     ❌ Sin máquinas compatibles para ${componentId}`);
        results.push({
          referencia: componentId,
          cantidadRequerida: componentData.quantity,
          cantidadOriginal: componentData.quantityOriginal,
          inventarioDisponible: componentData.inventoryAvailable,
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
          alerta: '❌ Sin máquinas compatibles o capacidad insuficiente'
        });
        continue;
      }

      // Calcular tiempo total requerido para este componente usando sam_unit
      const isMinutesPerUnit = compatibleMachines[0].sam_unit === 'min_per_unit';
      const tiempoTotalMinutos = isMinutesPerUnit
        ? (componentData.sam > 0 ? componentData.quantity * componentData.sam : 0)
        : (componentData.sam > 0 ? componentData.quantity / componentData.sam : 0);
      const tiempoTotalHoras = tiempoTotalMinutos / 60;

      console.log(`     ⏱️ Tiempo total requerido: ${tiempoTotalHoras.toFixed(2)}h`);

      // Distribuir trabajo entre máquinas compatibles
      let tiempoRestante = tiempoTotalHoras;

      // PASO 1: Calcular SOLO capacidad base (sin extras) para distribución inicial
      const machineCapacities = compatibleMachines.map(machine => {
        const baseCapacity = horasDisponiblesPorOperario;
        const currentLoad = machineWorkloads.get(machine.machines.name) || 0;
        const availableCapacity = Math.max(0, baseCapacity - currentLoad);
        
        return {
          machine,
          baseCapacity,
          currentLoad,
          availableCapacity
        };
      });

      // PASO 2: Ordenar máquinas por capacidad disponible (mayor a menor)
      machineCapacities.sort((a, b) => b.availableCapacity - a.availableCapacity);
      
      console.log(`     📊 Capacidades base disponibles:`);
      machineCapacities.forEach(mc => {
        console.log(`       - ${mc.machine.machines.name}: ${mc.availableCapacity.toFixed(2)}h disponibles`);
      });

      // PASO 3: Distribuir tiempo usando SOLO capacidad base
      for (const machineInfo of machineCapacities) {
        if (tiempoRestante <= 0.01) break;
        
        if (machineInfo.availableCapacity > 0) {
          const tiempoAsignado = Math.min(tiempoRestante, machineInfo.availableCapacity);
          const proporcion = tiempoAsignado / tiempoTotalHoras;
          const cantidadAsignada = Math.round(componentData.quantity * proporcion);
          
          const nuevaCarga = machineInfo.currentLoad + tiempoAsignado;
          const ocupacion = (nuevaCarga / machineInfo.baseCapacity) * 100;
          
          results.push({
            referencia: componentId,
            cantidadRequerida: cantidadAsignada,
            cantidadOriginal: componentData.quantityOriginal,
            inventarioDisponible: componentData.inventoryAvailable,
            sam: componentData.sam,
            tiempoTotal: tiempoAsignado * 60,
            maquina: machineInfo.machine.machines.name,
            estadoMaquina: machineInfo.machine.machines.status,
            proceso: processName,
            operadoresRequeridos: 1,
            operadoresDisponibles: processGroup.availableOperators,
            capacidadPorcentaje: (tiempoAsignado / machineInfo.baseCapacity) * 100,
            ocupacionMaquina: ocupacion,
            ocupacionProceso: (nuevaCarga / totalHorasDisponibles) * 100,
            alerta: ocupacion > 90 ? '⚠️ Capacidad casi al límite' : null
          });
          
          machineWorkloads.set(machineInfo.machine.machines.name, nuevaCarga);
          tiempoRestante -= tiempoAsignado;
          
          console.log(`     ✅ [ASSIGNED BASE] ${machineInfo.machine.machines.name}: ${cantidadAsignada} unidades, ${tiempoAsignado.toFixed(2)}h`);
        }
      }

      // PASO 4: Si queda tiempo sin asignar, intentar usar horas extras si están disponibles
      if (tiempoRestante > 0.01 && overtimeConfig) {
        console.log(`     🔄 [OVERTIME] Intentando reasignar ${tiempoRestante.toFixed(2)}h usando horas extras...`);
        
        const processOvertimeConfig = overtimeConfig.processes.find(
          p => p.processName === processName
        );
        
        if (processOvertimeConfig && processOvertimeConfig.enabled) {
          // Calcular capacidad extra disponible de cada máquina compatible
          const machinesWithExtra = compatibleMachines.map(machine => {
            let extraCapacity = 0;
            
            // Buscar configuración de extras para esta máquina
            let machineOvertimeConfig = processOvertimeConfig.machines.find(
              m => m.machineId === machine.machines.id.toString() && m.enabled
            );
            
            if (!machineOvertimeConfig) {
              machineOvertimeConfig = processOvertimeConfig.machines.find(
                m => m.machineName === machine.machines.name && m.enabled
              );
            }
            
            if (machineOvertimeConfig && machineOvertimeConfig.additionalCapacity > 0) {
              extraCapacity = machineOvertimeConfig.additionalCapacity / 60;
            }
            
            const currentLoad = machineWorkloads.get(machine.machines.name) || 0;
            const baseCapacity = horasDisponiblesPorOperario;
            
            return {
              machine,
              extraCapacity,
              baseCapacity,
              currentLoad,
              availableExtra: extraCapacity
            };
          }).filter(m => m.availableExtra > 0);
          
          // Ordenar por capacidad extra disponible (mayor a menor)
          machinesWithExtra.sort((a, b) => b.availableExtra - a.availableExtra);
          
          console.log(`     📊 Máquinas con horas extras disponibles:`);
          machinesWithExtra.forEach(m => {
            console.log(`       - ${m.machine.machines.name}: +${m.availableExtra.toFixed(2)}h extras`);
          });
          
          // Distribuir el tiempo restante en las horas extras
          for (const machineInfo of machinesWithExtra) {
            if (tiempoRestante <= 0.01) break;
            
            const tiempoAsignado = Math.min(tiempoRestante, machineInfo.availableExtra);
            const proporcion = tiempoAsignado / tiempoTotalHoras;
            const cantidadAsignada = Math.round(componentData.quantity * proporcion);
            
            const nuevaCarga = machineInfo.currentLoad + tiempoAsignado;
            const totalCapacity = machineInfo.baseCapacity + machineInfo.extraCapacity;
            const ocupacion = (nuevaCarga / totalCapacity) * 100;
            
            results.push({
              referencia: componentId,
              cantidadRequerida: cantidadAsignada,
              cantidadOriginal: componentData.quantityOriginal,
              inventarioDisponible: componentData.inventoryAvailable,
              sam: componentData.sam,
              tiempoTotal: tiempoAsignado * 60,
              maquina: machineInfo.machine.machines.name,
              estadoMaquina: machineInfo.machine.machines.status,
              proceso: processName,
              operadoresRequeridos: 1,
              operadoresDisponibles: processGroup.availableOperators,
              capacidadPorcentaje: (tiempoAsignado / totalCapacity) * 100,
              ocupacionMaquina: ocupacion,
              ocupacionProceso: (nuevaCarga / totalHorasConExtras) * 100,
              alerta: `⏰ Utiliza ${(tiempoAsignado * 60).toFixed(0)} min de horas extras`
            });
            
            machineWorkloads.set(machineInfo.machine.machines.name, nuevaCarga);
            tiempoRestante -= tiempoAsignado;
            
            console.log(`     ✅ [ASSIGNED OVERTIME] ${machineInfo.machine.machines.name}: ${cantidadAsignada} unidades, ${tiempoAsignado.toFixed(2)}h EN EXTRAS`);
          }
        }
      }

      // PASO 5: Si AÚN queda tiempo sin asignar después de intentar extras, crear "Capacidad insuficiente"
      if (tiempoRestante > 0.01) {
        console.log(`     🔴 Déficit final: ${tiempoRestante.toFixed(2)}h (no se pudo cubrir ni con extras)`);
        results.push({
          referencia: componentId,
          cantidadRequerida: Math.round(componentData.quantity * (tiempoRestante / tiempoTotalHoras)),
          cantidadOriginal: componentData.quantityOriginal,
          inventarioDisponible: componentData.inventoryAvailable,
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
          alerta: '🔴 Capacidad insuficiente - Requiere más operarios, máquinas o horas extras'
        });
      } else {
        console.log(`     ✅ Toda la producción fue asignada correctamente`);
      }
    }

    return results;
  };

  // Función helper para buscar configuración de proceso con fallback para procesos compartidos
  const findProcessConfig = (proceso: string, operatorConfig: OperatorConfig) => {
    // Intento 1: Búsqueda exacta
    let config = operatorConfig.processes.find(p => p.processName === proceso);
    
    // Intento 2: Si es Troquelado o Despunte, buscar configuración unificada (con variaciones)
    if (!config && (proceso === 'Troquelado' || proceso === 'Despunte')) {
      // Buscar variaciones de "Troquelado / Despunte" o "Troquelado/Despunte"
      config = operatorConfig.processes.find(p => {
        const normalized = p.processName.replace(/\s/g, '').toLowerCase();
        return normalized === 'troquelado/despunte' || normalized === 'despunte/troquelado';
      });
      
      if (config) {
        console.log(`✅ Usando configuración unificada "${config.processName}" para proceso: ${proceso}`);
      } else {
        console.warn(`⚠️ No se encontró configuración para ${proceso}. Configuraciones disponibles:`, 
          operatorConfig.processes.map(p => p.processName));
      }
    }
    
    if (!config) {
      console.warn(`⚠️ No se encontró configuración para proceso: ${proceso}`);
    }
    
    return config;
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

    // Manejo especial para procesos usando sam_unit
    const isMinutesPerUnit = bestMachine.sam_unit === 'min_per_unit';
    const tiempoTotal = isMinutesPerUnit
      ? (sam > 0 ? refToProcess.cantidad * sam : 0)
      : (sam > 0 ? refToProcess.cantidad / sam : 0);
    const tiempoTotalHoras = tiempoTotal / 60;

    // Verificar si es proceso especial
    const isSpecialProcess = proceso === 'Lavado' || proceso === 'Pintura';
    
    const processConfig = findProcessConfig(proceso, operatorConfig);
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
    const efficiencyFactor = (processConfig?.efficiency ?? 100) / 100;
    const baseHours = processConfig?.availableHours || operatorConfig.availableHours;
    const horasDisponiblesPorMaquina = baseHours * efficiencyFactor;
    const horasDisponiblesPorProceso = horasDisponiblesPorMaquina * operadoresDisponibles;
    
    // Validar para evitar división por cero
    const ocupacionMaquina = horasDisponiblesPorMaquina > 0 
      ? (newMachineWorkload / horasDisponiblesPorMaquina) * 100 
      : 0;
    const ocupacionProceso = horasDisponiblesPorProceso > 0 
      ? (newProcessWorkload / horasDisponiblesPorProceso) * 100 
      : 0;

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

  // Función para ordenar procesos según el orden deseado
  const getProcessOrder = (processName: string): number => {
    const orderMap: Record<string, number> = {
      'inyección': 1,
      'inyección / roscado conectores': 1,
      'roscadoconectores': 1,
      'punzonado': 2,
      'corte': 3,
      'troquelado': 4,
      'despunte': 4,
      'doblez': 5,
      'soldadura': 6,
      'mig': 7,
      'lavado': 8,
      'pintura': 9,
      'horno': 10,
      'ensambleint': 11,
      'tapas': 12,
      'ensamble': 13,
      'empaque': 14
    };
    
    const normalized = processName.toLowerCase();
    return orderMap[normalized] || 999;
  };

  // Función para ordenar máquinas de manera natural (TQ-01, TQ-02, TQ-10)
  const sortMachineNames = (a: string, b: string): number => {
    // Extraer prefijo y número
    const matchA = a.match(/^([A-Z]+)-?(\d+)$/i);
    const matchB = b.match(/^([A-Z]+)-?(\d+)$/i);
    
    if (matchA && matchB) {
      const [, prefixA, numA] = matchA;
      const [, prefixB, numB] = matchB;
      
      // Primero comparar prefijos
      if (prefixA !== prefixB) {
        return prefixA.localeCompare(prefixB);
      }
      
      // Luego comparar números
      return parseInt(numA, 10) - parseInt(numB, 10);
    }
    
    // Fallback a comparación alfabética
    return a.localeCompare(b);
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
      // Buscar la configuración del proceso para obtener las horas específicas
      const processConfig = findProcessConfig(name, operatorConfig);
      const hoursPerOperator = processConfig?.availableHours || operatorConfig.availableHours;
      const availableHours = info.effective * hoursPerOperator;
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
    })
    .sort((a, b) => getProcessOrder(a.name) - getProcessOrder(b.name));

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
          cantidadOriginal?: number;
          inventarioDisponible?: number;
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

    // Map para rastrear tiempo total por máquina física (todas las máquinas compartidas)
    const sharedMachineWorkload = new Map<string, number>();
    
    // Map para rastrear qué procesos usan cada máquina
    const machineToProcesses = new Map<string, Set<string>>();

    // Consolidar datos por proceso y máquina (SIN normalización - mantener procesos separados)
    projection.forEach(item => {
      // Mantener el nombre original del proceso (NO normalizar)
      const displayProcessName = item.proceso;
      
      if (!processMap.has(displayProcessName)) {
        // Para buscar la configuración, sí necesitamos normalizar porque en OperatorConfiguration están unificados
        const configSearchName = normalizeProcessName(item.proceso) || item.proceso;
        const processConfig = findProcessConfig(configSearchName, operatorConfig);
        
        const totalOperators = processConfig?.operatorCount || 0;
        const baseHours = processConfig?.availableHours || operatorConfig.availableHours;
        const efficiencyFactor = (processConfig?.efficiency ?? 100) / 100;
        const processAvailableHours = baseHours * efficiencyFactor;
        
        processMap.set(displayProcessName, {
          processName: displayProcessName,
          machines: new Map(),
          totalTime: 0,
          availableHours: processAvailableHours,
          operators: totalOperators
        });
      }

      const processGroup = processMap.get(displayProcessName)!;
      
      if (!processGroup.machines.has(item.maquina)) {
        processGroup.machines.set(item.maquina, {
          machineId: item.maquina,
          machineName: item.maquina,
          totalTime: 0,
          references: [] as { referencia: string; cantidadRequerida: number; cantidadOriginal?: number; inventarioDisponible?: number; sam: number; tiempoTotal: number; ocupacionPorcentaje: number; alerta?: string }[]
        });
      }

      const machineGroup = processGroup.machines.get(item.maquina)!;
      
      // Agregar referencia a la máquina
      machineGroup.references.push({
        referencia: item.referencia,
        cantidadRequerida: item.cantidadRequerida,
        cantidadOriginal: item.cantidadOriginal,
        inventarioDisponible: item.inventarioDisponible,
        sam: item.sam,
        tiempoTotal: item.tiempoTotal,
        ocupacionPorcentaje: item.capacidadPorcentaje,
        alerta: item.alerta || undefined
      });

      // Actualizar tiempos totales del proceso
      machineGroup.totalTime += item.tiempoTotal;
      processGroup.totalTime += item.tiempoTotal;
      
      // NUEVO: Rastrear tiempo total de máquina compartida (EXCEPTO máquinas virtuales)
      const isVirtualMachine = item.maquina === 'Capacidad insuficiente' || 
                               item.maquina === 'Sin máquina compatible';
      
      if (!isVirtualMachine) {
        const currentMachineTotal = sharedMachineWorkload.get(item.maquina) || 0;
        sharedMachineWorkload.set(item.maquina, currentMachineTotal + item.tiempoTotal);
        
        // NUEVO: Rastrear procesos que usan esta máquina (solo máquinas reales)
        if (!machineToProcesses.has(item.maquina)) {
          machineToProcesses.set(item.maquina, new Set());
        }
        machineToProcesses.get(item.maquina)!.add(displayProcessName);
        
        console.log(`[DEBUG] ${item.maquina} - ${displayProcessName}: +${item.tiempoTotal.toFixed(2)}min (Total máquina: ${sharedMachineWorkload.get(item.maquina)!.toFixed(2)}min)`);
      }
    });

    // Log resumen de máquinas compartidas
    machineToProcesses.forEach((processes, machine) => {
      if (processes.size > 1) {
        const totalTime = sharedMachineWorkload.get(machine) || 0;
        console.log(`[SHARED MACHINE] ${machine} usada por: ${Array.from(processes).join(', ')} | Total: ${totalTime.toFixed(2)}min`);
      }
    });

    // EXCEPCIÓN ESPECIAL: Proceso PPOLVO1 solo en CB-02
    processMap.forEach((processGroup, processName) => {
      if (processName.includes('PPOLVO1')) {
        console.log(`🎨 [PINTURA ESPECIAL] Proceso ${processName} debe ir exclusivamente a CB-02`);
        
        // Encontrar máquina CB-02
        const cb02Machine = Array.from(processGroup.machines.values())
          .find(m => m.machineName === 'CB-02');
        
        if (cb02Machine) {
          // Recolectar todas las referencias del proceso
          const allReferencesInProcess: typeof cb02Machine.references = [];
          let totalTimeForCB02 = 0;
          
          processGroup.machines.forEach(machine => {
            machine.references.forEach(ref => {
              allReferencesInProcess.push(ref);
              totalTimeForCB02 += ref.tiempoTotal;
            });
            // Limpiar referencias de otras máquinas
            if (machine.machineName !== 'CB-02') {
              machine.references = [];
              machine.totalTime = 0;
            }
          });
          
          // Asignar todas las referencias a CB-02
          cb02Machine.references = allReferencesInProcess;
          cb02Machine.totalTime = totalTimeForCB02;
          
          // Actualizar workload compartido
          sharedMachineWorkload.set('CB-02', totalTimeForCB02);
          
          console.log(`✅ [PINTURA] ${allReferencesInProcess.length} referencias asignadas exclusivamente a CB-02 (${(totalTimeForCB02/60).toFixed(2)}h)`);
          
          // Marcar el proceso como "bloqueado" para evitar redistribución
          (processGroup as any).locked = true;
        } else {
          console.error(`❌ [PINTURA] Máquina CB-02 no encontrada para proceso PPOLVO1`);
        }
      }
    });

    // Convertir a formato esperado por HierarchicalCapacityView
    const processGroupsArray = Array.from(processMap.values()).map(processGroup => {
      const totalAvailableHours = processGroup.operators * processGroup.availableHours * 60; // en minutos
      
      // Calcular horas extras totales del proceso (SUMA de todas las máquinas con extras)
      let totalProcessOvertimeMinutes = 0;
      let overtimeMachinesCount = 0;
      if (overtimeConfig) {
        const processOvertimeConfig = overtimeConfig.processes.find(
          p => p.processName === processGroup.processName
        );
        
        if (processOvertimeConfig && processOvertimeConfig.enabled) {
          processOvertimeConfig.machines.forEach(m => {
            if (m.enabled && m.additionalCapacity > 0) {
              totalProcessOvertimeMinutes += m.additionalCapacity;
              overtimeMachinesCount++;
            }
          });
          
          console.log(`[OVERTIME POOL] ${processGroup.processName}: ${overtimeMachinesCount} máquinas con extras = ${totalProcessOvertimeMinutes.toFixed(2)}min totales`);
        }
      }
      
      const totalAvailableWithOvertime = totalAvailableHours + totalProcessOvertimeMinutes;
      const totalOccupancy = totalAvailableWithOvertime > 0 ? (processGroup.totalTime / totalAvailableWithOvertime) * 100 : 0;
      
      console.log(`[PROCESS ${processGroup.processName}]`);
      console.log(`  Base: ${totalAvailableHours.toFixed(2)}min`);
      console.log(`  Extras: ${totalProcessOvertimeMinutes.toFixed(2)}min`);
      console.log(`  Total disponible: ${totalAvailableWithOvertime.toFixed(2)}min`);
      console.log(`  Tiempo requerido: ${processGroup.totalTime.toFixed(2)}min`);
      console.log(`  Ocupación: ${totalOccupancy.toFixed(1)}%`);

      // Contar máquinas operativas en el proceso (excluyendo virtuales)
      const operationalMachines = Array.from(processGroup.machines.values())
        .filter(m => m.machineName !== 'Capacidad insuficiente' && m.machineName !== 'Sin máquina compatible');
      
      const operationalCount = operationalMachines.length;
      
      // Distribuir las horas extras entre TODAS las máquinas operativas
      const overtimePerMachine = operationalCount > 0 ? totalProcessOvertimeMinutes / operationalCount : 0;
      
      console.log(`[OVERTIME DISTRIBUTION] Distribuyendo ${totalProcessOvertimeMinutes.toFixed(2)}min entre ${operationalCount} máquinas = ${overtimePerMachine.toFixed(2)}min por máquina`);

      // NUEVO: REDISTRIBUIR REFERENCIAS cuando hay horas extras
      // PERO NO si el proceso está bloqueado (ej: PPOLVO1)
      if (overtimePerMachine > 0 && operationalCount > 1 && !(processGroup as any).locked) {
        console.log(`[REBALANCING] Redistribuyendo referencias entre ${operationalCount} máquinas del proceso ${processGroup.processName}`);
        
        // Recolectar todas las referencias del proceso
        const allReferences = new Map<string, {
          referencia: string;
          cantidadRequerida: number;
          sam: number;
          tiempoTotal: number;
        }>();
        
        processGroup.machines.forEach(machine => {
          if (machine.machineName !== 'Capacidad insuficiente' && machine.machineName !== 'Sin máquina compatible') {
            machine.references.forEach(ref => {
              const key = ref.referencia;
              if (allReferences.has(key)) {
                const existing = allReferences.get(key)!;
                existing.cantidadRequerida += ref.cantidadRequerida;
                existing.tiempoTotal += ref.tiempoTotal;
              } else {
                allReferences.set(key, {
                  referencia: ref.referencia,
                  cantidadRequerida: ref.cantidadRequerida,
                  sam: ref.sam,
                  tiempoTotal: ref.tiempoTotal
                });
              }
            });
          }
        });
        
        console.log(`[REBALANCING] ${allReferences.size} referencias únicas a redistribuir`);
        
        // Calcular capacidad total de cada máquina (base + extras)
        const machineCapacities = operationalMachines.map(m => ({
          machineName: m.machineName,
          baseCapacity: processGroup.availableHours * 60,
          overtimeCapacity: overtimePerMachine,
          totalCapacity: processGroup.availableHours * 60 + overtimePerMachine,
          currentLoad: 0 // Reset para redistribución
        }));
        
        // Redistribuir referencias proporcionalmente
        processGroup.machines.forEach(machine => {
          if (machine.machineName !== 'Capacidad insuficiente' && machine.machineName !== 'Sin máquina compatible') {
            machine.references = [];
            machine.totalTime = 0;
          }
        });
        
        // Distribuir cada referencia entre las máquinas disponibles
        allReferences.forEach(refData => {
          let tiempoRestante = refData.tiempoTotal;
          let cantidadRestante = refData.cantidadRequerida;
          
          // Ordenar máquinas por menor carga actual
          machineCapacities.sort((a, b) => a.currentLoad - b.currentLoad);
          
          machineCapacities.forEach((machineCapacity, index) => {
            if (tiempoRestante <= 0) return;
            
            const machineGroup = processGroup.machines.get(machineCapacity.machineName);
            if (!machineGroup) return;
            
            // Calcular cuánto tiempo asignar a esta máquina
            const capacidadDisponible = machineCapacity.totalCapacity - machineCapacity.currentLoad;
            const tiempoAsignar = index === machineCapacities.length - 1
              ? tiempoRestante // Última máquina toma todo lo restante
              : Math.min(tiempoRestante, capacidadDisponible * 0.8); // Otras máquinas toman hasta 80% de su disponible
            
            if (tiempoAsignar > 0) {
              const proporcion = tiempoAsignar / refData.tiempoTotal;
              const cantidadAsignar = Math.round(cantidadRestante * proporcion);
              
              machineGroup.references.push({
                referencia: refData.referencia,
                cantidadRequerida: cantidadAsignar,
                sam: refData.sam,
                tiempoTotal: tiempoAsignar,
                ocupacionPorcentaje: (tiempoAsignar / machineCapacity.totalCapacity) * 100
              });
              
              machineGroup.totalTime += tiempoAsignar;
              machineCapacity.currentLoad += tiempoAsignar;
              tiempoRestante -= tiempoAsignar;
              cantidadRestante -= cantidadAsignar;
              
              console.log(`  ✓ ${machineCapacity.machineName}: ${cantidadAsignar} unidades de ${refData.referencia} (${(tiempoAsignar/60).toFixed(2)}h)`);
            }
          });
        });
        
        console.log(`[REBALANCING] Redistribución completada. Nueva carga por máquina:`);
        machineCapacities.forEach(mc => {
          console.log(`  - ${mc.machineName}: ${(mc.currentLoad/60).toFixed(2)}h / ${(mc.totalCapacity/60).toFixed(2)}h (${(mc.currentLoad/mc.totalCapacity*100).toFixed(1)}%)`);
        });
      }

      // Ordenar máquinas de manera natural
      const machines = Array.from(processGroup.machines.values())
        .sort((a, b) => sortMachineNames(a.machineName, b.machineName))
        .map(machine => {
          let machineAvailableTime = processGroup.availableHours * 60; // en minutos
          let overtimeHours = 0;
          let overtimeShifts = undefined;
          
          const isVirtualMachine = machine.machineName === 'Capacidad insuficiente' || 
                                   machine.machineName === 'Sin máquina compatible';
          
          // NUEVA LÓGICA: Aplicar extras solo a máquinas operativas
          if (!isVirtualMachine && overtimePerMachine > 0) {
            overtimeHours = overtimePerMachine / 60; // Convertir a horas
            machineAvailableTime += overtimePerMachine;
            
            // Obtener configuración de turnos de la primera máquina con extras habilitada
            if (overtimeConfig) {
              const processOvertimeConfig = overtimeConfig.processes.find(
                p => p.processName === processGroup.processName
              );
              if (processOvertimeConfig) {
                const anyEnabledMachine = processOvertimeConfig.machines.find(m => m.enabled);
                if (anyEnabledMachine) {
                  overtimeShifts = anyEnabledMachine.shifts;
                }
              }
            }
            
            console.log(`✅ [OVERTIME APPLIED] ${machine.machineName}: +${overtimeHours.toFixed(2)}h (capacidad total: ${(machineAvailableTime/60).toFixed(2)}h)`);
          }
          
          // Calcular ocupación usando el tiempo REDISTRIBUIDO
          // Si hay redistribución, machine.totalTime ya fue actualizado
          // Si no hay redistribución, usamos el workload compartido original
          let totalMachineTime = machine.totalTime;
          if (!isVirtualMachine && overtimePerMachine === 0) {
            // Solo usar sharedMachineWorkload si NO hubo redistribución
            const sharedWorkload = sharedMachineWorkload.get(machine.machineName);
            if (sharedWorkload) {
              totalMachineTime = sharedWorkload;
            }
          }
          
          const machineOccupancy = machineAvailableTime > 0 ? (totalMachineTime / machineAvailableTime) * 100 : 0;
          
          console.log(`  📊 [MACHINE FINAL] ${machine.machineName}: ${totalMachineTime.toFixed(2)}min / ${machineAvailableTime.toFixed(2)}min = ${machineOccupancy.toFixed(1)}%`);
          
          // Determinar si es compartida (solo para máquinas reales, reutilizar isVirtualMachine de arriba)
          const processesUsingMachine = machineToProcesses.get(machine.machineName);
          const isShared = !isVirtualMachine && processesUsingMachine && processesUsingMachine.size > 1;
          const sharedWith = isShared ? Array.from(processesUsingMachine!).filter(p => p !== processGroup.processName) : [];

          return {
            machineId: machine.machineId,
            machineName: machine.machineName,
            totalTime: machine.totalTime, // Tiempo redistribuido de este proceso
            totalMachineTime, // Tiempo total (redistribuido si aplica)
            occupancy: machineOccupancy, // Ocupación con capacidad total (base + extras)
            capacity: machineAvailableTime,
            references: machine.references,
            isShared,
            sharedWith,
            overtimeHours,
            overtimeShifts
          };
        });

      // Detectar si este proceso comparte operarios con otro
      const sharesOperatorsWith = (processGroup.processName === 'Troquelado' || processGroup.processName === 'Despunte') 
        ? 'Troquelado y Despunte comparten los mismos operarios'
        : undefined;

      return {
        processName: processGroup.processName,
        totalOccupancy,
        totalTime: processGroup.totalTime,
        availableHours: processGroup.availableHours,
        totalAvailableMinutes: totalAvailableWithOvertime, // NUEVO: Incluye extras
        machines,
        effectiveStations: processGroup.operators,
        operators: processGroup.operators,
        sharedOperatorsWith: sharesOperatorsWith
      };
    });

    // AJUSTAR OCUPACIÓN PARA TROQUELADO/DESPUNTE SI AMBOS EXISTEN
    const troquelado = processGroupsArray.find(p => p.processName === 'Troquelado');
    const despunte = processGroupsArray.find(p => p.processName === 'Despunte');
    
    if (troquelado && despunte) {
      console.log(`[SHARED OPERATORS] Detectados Troquelado y Despunte - Recalculando ocupación combinada`);
      
      // Sumar tiempos de ambos procesos
      const combinedTime = troquelado.totalTime + despunte.totalTime;
      
      // Calcular horas extras combinadas
      let combinedOvertimeMinutes = 0;
      if (overtimeConfig) {
        ['Troquelado', 'Despunte'].forEach(processName => {
          const processOvertimeConfig = overtimeConfig.processes.find(p => p.processName === processName);
          if (processOvertimeConfig && processOvertimeConfig.enabled) {
            processOvertimeConfig.machines.forEach(m => {
              if (m.enabled && m.additionalCapacity > 0) {
                combinedOvertimeMinutes += m.additionalCapacity;
              }
            });
          }
        });
      }
      
      // Usar operarios de uno solo (no duplicar) - tomamos de Troquelado
      const totalAvailableHours = troquelado.operators * troquelado.availableHours * 60; // en minutos
      const totalAvailableWithOvertime = totalAvailableHours + combinedOvertimeMinutes;
      
      // Calcular ocupación combinada
      const combinedOccupancy = totalAvailableWithOvertime > 0 ? (combinedTime / totalAvailableWithOvertime) * 100 : 0;
      
      console.log(`[SHARED OPERATORS] Tiempo Troquelado: ${troquelado.totalTime.toFixed(2)}min | Tiempo Despunte: ${despunte.totalTime.toFixed(2)}min`);
      console.log(`[SHARED OPERATORS] Tiempo Combinado: ${combinedTime.toFixed(2)}min | Disponible: ${totalAvailableWithOvertime.toFixed(2)}min | Ocupación: ${combinedOccupancy.toFixed(1)}%`);
      
      // Actualizar ocupación de ambos procesos con el valor combinado
      troquelado.totalOccupancy = combinedOccupancy;
      despunte.totalOccupancy = combinedOccupancy;
    }

    return processGroupsArray
    .filter(p => p.machines.length > 0 || p.totalTime > 0) // Solo procesos con trabajo asignado
    .sort((a, b) => getProcessOrder(a.processName) - getProcessOrder(b.processName));
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
    const processGroups = createHierarchicalData();
    
    // Identificar TODAS las máquinas operacionales (incluyendo las que tienen y no tienen déficit)
    const identifiedDeficits: DeficitInfo[] = [];
    processGroups.forEach(process => {
      process.machines.forEach(machine => {
        // Excluir máquinas virtuales (Capacidad insuficiente, Sin máquina compatible)
        const isVirtualMachine = machine.machineName === 'Capacidad insuficiente' || 
                                 machine.machineName === 'Sin máquina compatible';
        
        if (isVirtualMachine) return; // No incluir máquinas virtuales en configuración de extras
        
        // Calcular capacidad base (sin extras)
        const baseCapacity = machine.capacity - (machine.overtimeHours || 0) * 60; // Restar extras si existen
        const occupancyWithoutOvertime = baseCapacity > 0 ? (machine.totalTime / baseCapacity) * 100 : machine.occupancy;
        
        // Calcular déficit (puede ser negativo si hay capacidad sobrante)
        const availableMinutes = baseCapacity;
        const requiredMinutes = machine.totalTime;
        const deficitMinutes = Math.max(0, requiredMinutes - availableMinutes); // Solo positivo si hay déficit real
        
        // INCLUIR TODAS las máquinas (con y sin déficit) para permitir configuración flexible
        identifiedDeficits.push({
          processName: process.processName,
          machineName: machine.machineName,
          machineId: machine.machineId,
          deficitMinutes, // 0 si no hay déficit
          deficitPercentage: Math.max(0, occupancyWithoutOvertime - 100), // 0 si no hay déficit
          currentOccupancy: occupancyWithoutOvertime,
          operators: process.operators,
          efficiency: operatorConfig.processes.find(p => p.processName === process.processName)?.efficiency || 100
        });
      });
    });
    
    const handleOptimizeWithOvertime = () => {
      if (onDeficitsIdentified) {
        onDeficitsIdentified(identifiedDeficits);
      }
    };
    
    // Siempre mostrar botón de horas extras (permite configurar incluso sin déficit)
    const shouldShowOvertimeButton = identifiedDeficits.length > 0;
    
    return (
      <HierarchicalCapacityView
        processGroups={processGroups}
        onBack={onBack}
        onStartOver={onStartOver}
        hasDeficits={shouldShowOvertimeButton}
        onOptimizeWithOvertime={handleOptimizeWithOvertime}
        onExportCSV={exportToCSV}
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
                    <TableCell>{item.sam.toFixed(3)}</TableCell>
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