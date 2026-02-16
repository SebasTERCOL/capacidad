import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Package, Minus, ArrowRight, Database, ChevronDown, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ProductionRequest } from "./FileUpload";
import { toast } from "sonner";

interface BOMComponent {
  component_id: string;
  cantidad_requerida: number;
  cantidad_disponible: number;
  cantidad_a_producir: number;
  type: string;
  minimum_unit: number | null;
  maximum_unit: number | null;
  quedara_disponible: number;
  alerta: 'ok' | 'warning' | 'error';
}

interface AdjustedReference {
  referencia: string;
  cantidad_original: number;
  componentes: BOMComponent[];
}

export interface AdjustedProductionData {
  referencia: string;
  cantidad: number;
  inventario: number;
}

interface InventoryAdjustmentProps {
  data: ProductionRequest[];
  onNext: () => void;
  onBack: () => void;
  onAdjustmentComplete: (adjustedData: AdjustedProductionData[]) => void;
  useInventory: boolean;
}

export const InventoryAdjustment: React.FC<InventoryAdjustmentProps> = ({
  data,
  onNext,
  onBack,
  onAdjustmentComplete,
  useInventory
}) => {
  const [adjustedReferences, setAdjustedReferences] = useState<AdjustedReference[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [currentReference, setCurrentReference] = useState<string>('');
  const [openReferences, setOpenReferences] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (data.length > 0) {
      // Siempre procesar el inventario para obtener el desglose BOM completo
      // Solo cambia el uso del inventario en la fórmula de Diferencia
      processInventoryAdjustment();
    }
  }, [data, useInventory]);

  // Cache para BOMs ya consultados
  const bomCache = new Map<string, { component_id: string; amount: number }[]>();

  // Función optimizada para obtener BOM con cache
  const getBOMFromCache = async (productId: string): Promise<{ component_id: string; amount: number }[]> => {
    const key = productId.trim().toUpperCase();
    
    if (bomCache.has(key)) {
      return bomCache.get(key)!;
    }
    
    const { data: bomData } = await supabase
      .from('bom')
      .select('component_id, amount')
      .eq('product_id', key);
    
    const result = bomData || [];
    bomCache.set(key, result);
    return result;
  };

  // Función recursiva optimizada para obtener BOM
  const getRecursiveBOM = async (
    productId: string, 
    quantity: number = 1, 
    level: number = 0, 
    visited: Set<string> = new Set()
  ): Promise<Map<string, number>> => {
    if (level > 10 || visited.has(productId)) {
      return new Map();
    }
    
    visited.add(productId);
    const componentsMap = new Map<string, number>();
    
    const bomData = await getBOMFromCache(productId);
    
    if (bomData.length === 0) {
      return componentsMap;
    }
    
    // Procesar componentes en paralelo
    const subComponentPromises = bomData.map(async (bomItem) => {
      const componentId = bomItem.component_id.trim().toUpperCase();
      const componentQuantity = quantity * bomItem.amount;
      
      const subComponents = await getRecursiveBOM(
        componentId, 
        componentQuantity, 
        level + 1, 
        new Set(visited)
      );
      
      return { componentId, componentQuantity, subComponents };
    });
    
    const results = await Promise.all(subComponentPromises);
    
    // Agregar componentes al mapa
    for (const { componentId, componentQuantity, subComponents } of results) {
      const existingQuantity = componentsMap.get(componentId) || 0;
      componentsMap.set(componentId, existingQuantity + componentQuantity);
      
      for (const [subComponentId, subQuantity] of subComponents) {
        const existingSubQuantity = componentsMap.get(subComponentId) || 0;
        componentsMap.set(subComponentId, existingSubQuantity + subQuantity);
      }
    }
    
    return componentsMap;
  };

  // Normalización de referencias para matching consistente
  const normalizeRefId = (ref: string) => {
    return String(ref || '')
      .normalize('NFKC')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
  };

  const processInventoryAdjustment = async () => {
    setLoading(true);
    setError(null);
    setProgress(0);
    
    try {
      const totalItems = data.length;
      console.log(`📦 Iniciando ajuste de inventario para ${totalItems} referencias`);
      
      // Cargar procesos excluidos dinámicamente desde la columna 'inventario' de la tabla 'processes'
      const { data: excludedProcesses } = await supabase
        .from('processes')
        .select('id, name')
        .eq('inventario', false);
      
      const excludedIds = excludedProcesses?.map(p => p.id) || [];
      const excludedNames = excludedProcesses?.map(p => `${p.name} (${p.id})`).join(', ') || 'Ninguno';
      
      console.log(`🚫 Procesos excluidos de ajuste de inventario (inventario=false): ${excludedNames}`);
      
      // === CARGAR TODOS LOS PRODUCTOS CON PAGINACIÓN (igual que ProductionProjectionV2) ===
      console.log('\n📦 === CARGANDO INVENTARIO COMPLETO CON PAGINACIÓN ===');
      const pageSize = 1000;
      let inventoryFrom = 0;
      let allProducts: any[] = [];
      
      while (true) {
        const { data: productsPage, error: invError } = await supabase
          .from('products')
          .select('reference, quantity, type, minimum_unit, maximum_unit')
          .order('reference')
          .range(inventoryFrom, inventoryFrom + pageSize - 1);
        
        if (invError) {
          console.error('❌ Error cargando inventario:', invError);
          break;
        }
        
        const chunk = productsPage || [];
        allProducts = allProducts.concat(chunk);
        console.log(`   Página ${Math.floor(inventoryFrom / pageSize) + 1}: ${chunk.length} productos`);
        
        if (chunk.length < pageSize) break;
        inventoryFrom += pageSize;
      }
      
      console.log(`✅ Total productos cargados: ${allProducts.length}`);
      
      // Crear mapas normalizados para inventario
      const inventoryByNorm = new Map<string, number>();
      const productDataByNorm = new Map<string, any>();
      
      for (const prod of allProducts) {
        const rawRef = prod.reference as string | null;
        if (!rawRef) continue;
        
        const normRef = normalizeRefId(rawRef);
        const qty = Number(prod.quantity ?? 0);
        
        // Inventario acumulado por referencia normalizada
        const currentQty = inventoryByNorm.get(normRef) || 0;
        inventoryByNorm.set(normRef, currentQty + qty);
        
        // Guardar datos del producto
        if (!productDataByNorm.has(normRef)) {
          productDataByNorm.set(normRef, prod);
        }
      }
      
      console.log(`   Referencias únicas normalizadas: ${inventoryByNorm.size}`);
      
      // DEBUG: Verificar referencias específicas
      const testRefs = ['T-CE1515', 'T-CE2020', 'CUE12D', 'CNCE125-CMB'];
      console.log('\n🔍 === VERIFICACIÓN INVENTARIO ===');
      for (const testRef of testRefs) {
        const normTest = normalizeRefId(testRef);
        const qty = inventoryByNorm.get(normTest) ?? 0;
        console.log(`   ${testRef} (norm: ${normTest}): ${qty} unidades`);
      }
      
      // Función para buscar inventario normalizado
      const getInventoryByNorm = (ref: string): number => {
        if (!ref) return 0;
        return inventoryByNorm.get(normalizeRefId(ref)) ?? 0;
      };
      
      const getProductDataByNorm = (ref: string): any | undefined => {
        if (!ref) return undefined;
        return productDataByNorm.get(normalizeRefId(ref));
      };
      
      // Paso 1: Obtener tipos de todas las referencias principales
      const mainProductsMap = new Map<string, string>();
      for (const item of data) {
        const refNorm = normalizeRefId(item.referencia);
        const prodData = productDataByNorm.get(refNorm);
        if (prodData) {
          mainProductsMap.set(item.referencia.trim().toUpperCase(), prodData.type);
        }
      }

      // Obtener procesos asociados a cada componente para aplicar excepciones
      // Cargar TODOS los machines_processes con paginación (hay 9000+ registros)
      let allMachinesProcesses: any[] = [];
      let mpFrom = 0;
      const mpPageSize = 1000;
      while (true) {
        const { data: mpPage } = await supabase
          .from('machines_processes')
          .select('ref, id_process')
          .order('id')
          .range(mpFrom, mpFrom + mpPageSize - 1);
        const mpChunk = mpPage || [];
        allMachinesProcesses = allMachinesProcesses.concat(mpChunk);
        if (mpChunk.length < mpPageSize) break;
        mpFrom += mpPageSize;
      }
      console.log(`✅ Cargados ${allMachinesProcesses.length} registros machines_processes (paginado)`);
      
      // 🔍 DIAGNÓSTICO: Verificar refs críticas en datos cargados
      const criticalRefs = ['DFCA30', 'T-CA30', 'TCHCA30', 'TSCA30', 'CCA30', 'CNCA30', 'PTCA-30'];
      for (const cr of criticalRefs) {
        const matches = allMachinesProcesses.filter(mp => mp.ref === cr);
        console.log(`   🔍 ${cr} en allMachinesProcesses: ${matches.length} registros${matches.length > 0 ? `, procesos: ${[...new Set(matches.map(m => m.id_process))].join(',')}` : ''}`);
      }
      
      const componentProcessesMap = new Map<string, Set<number>>();
      allMachinesProcesses?.forEach(mp => {
        const ref = mp.ref.trim().toUpperCase();
        const refNorm = normalizeRefId(mp.ref);
        if (!componentProcessesMap.has(ref)) {
          componentProcessesMap.set(ref, new Set());
        }
        componentProcessesMap.get(ref)!.add(mp.id_process);
        // También agregar versión normalizada
        if (!componentProcessesMap.has(refNorm)) {
          componentProcessesMap.set(refNorm, new Set());
        }
        componentProcessesMap.get(refNorm)!.add(mp.id_process);
      });
      
      // 🔍 DIAGNÓSTICO: Verificar componentProcessesMap
      for (const cr of criticalRefs) {
        const processes = componentProcessesMap.get(cr);
        const normProcesses = componentProcessesMap.get(normalizeRefId(cr));
        console.log(`   🔍 componentProcessesMap['${cr}']: ${processes ? `${processes.size} procesos (${[...processes].join(',')})` : 'NO EXISTE'}`);
        console.log(`   🔍 componentProcessesMap['${normalizeRefId(cr)}']: ${normProcesses ? `${normProcesses.size} procesos` : 'NO EXISTE'}`);
      }

      // Mapas globales para controlar el uso de inventario por componente
      const inventoryTotals = new Map<string, number>();
      const inventoryUsed = new Map<string, number>();
      
      // Paso 2: Procesar referencias en lotes de 5 (paralelismo controlado)
      const BATCH_SIZE = 5;
      const results: AdjustedReference[] = [];
      const adjustedProductionData: AdjustedProductionData[] = [];
      
      for (let i = 0; i < data.length; i += BATCH_SIZE) {
        const batch = data.slice(i, i + BATCH_SIZE);
        
        const batchPromises = batch.map(async (item) => {
          const ref = item.referencia.trim().toUpperCase();
          
          setCurrentReference(ref);
          console.log(`🔄 Procesando ${ref} (${i + batch.indexOf(item) + 1}/${totalItems})`);
          
          // SIEMPRE agregar la referencia raíz del CSV para que llegue a Ensamble/Empaque
          // CRÍTICO: Usar la referencia normalizada (ref) para que coincida con machines_processes
          const itemAdjusted: AdjustedProductionData[] = [{
            referencia: ref,  // ✅ Ya normalizada en línea 280: trim().toUpperCase()
            cantidad: item.cantidad,
            inventario: 0
          }];
          console.log(`✅ Agregando producto raíz a adjustedData: ${item.referencia} → ${ref} (cantidad: ${item.cantidad})`);
          
          const productType = mainProductsMap.get(ref) || 'UNKNOWN';
          
          // SIEMPRE intentar obtener BOM, independientemente del tipo
          // Esto asegura que referencias como TRP336T expandan su BOM aunque no estén marcadas como PT
          const allComponents = await getRecursiveBOM(ref, item.cantidad);
          
          // Si no tiene BOM, retornamos solo la referencia raíz (aún válida para Ensamble/Empaque)
          if (allComponents.size === 0) {
            console.log(`   ℹ️ ${ref} (tipo: ${productType}) sin BOM, solo se incluye la referencia principal`);
            return {
              adjusted: itemAdjusted,
              analysis: null
            };
          }
          
          console.log(`   ✅ ${ref} (tipo: ${productType}) con BOM de ${allComponents.size} componentes`);
          
          // Usar el mapa de productos cargado con paginación
          const componentAnalysis: BOMComponent[] = [];
          
          // Consolidar componentes para evitar duplicación por proceso
          const consolidatedComponents = new Map<string, number>();
          for (const [componentId, cantidadNecesaria] of allComponents) {
            const existing = consolidatedComponents.get(componentId) || 0;
            consolidatedComponents.set(componentId, existing + cantidadNecesaria);
          }
          
          for (const [componentId, cantidadNecesaria] of consolidatedComponents) {
            // Buscar datos usando normalización
            const componentNorm = normalizeRefId(componentId);
            const productData = getProductDataByNorm(componentId);
            const inventarioDisponible = getInventoryByNorm(componentId);
            
            // Si no existe en products o es PT, no se ajusta
            if (!productData || productData.type === 'PT') {
              itemAdjusted.push({
                referencia: componentId,
                cantidad: Math.ceil(cantidadNecesaria),
                inventario: 0
              });
              continue;
            }

            // Verificar si el componente tiene procesos excluidos (usar versión normalizada también)
            const componentProcesses = componentProcessesMap.get(componentId) || componentProcessesMap.get(componentNorm);
            const hasExcludedProcess = componentProcesses ? 
              Array.from(componentProcesses).some(processId => excludedIds.includes(processId)) : 
              false;

            // Cantidad requerida redondeada
            const cantidadRequerida = Math.ceil(cantidadNecesaria);

            // SIEMPRE mostrar el inventario disponible real para el componente
            // Independientemente de si tiene procesos excluidos o no
            if (!inventoryTotals.has(componentNorm)) {
              inventoryTotals.set(componentNorm, inventarioDisponible);
            }
            const totalDisponible = inventoryTotals.get(componentNorm)!;
            
            // Para el cálculo de "a producir", solo aplicamos inventario si NO tiene procesos excluidos
            const inventarioParaCalculo = hasExcludedProcess ? 0 : totalDisponible;

            // Usar clave normalizada para consistencia
            const usadoHastaAhora = inventoryUsed.get(componentNorm) || 0;
            // Solo calcular inventario restante si NO tiene procesos excluidos
            const restante = hasExcludedProcess ? 0 : Math.max(0, inventarioParaCalculo - usadoHastaAhora);
            const usadoEnEsteProducto = Math.min(restante, cantidadRequerida);

            const cantidadAProducir = Math.max(0, cantidadRequerida - usadoEnEsteProducto);
            // Para "quedará disponible", siempre usar el inventario real
            const quedaraDisponible = hasExcludedProcess 
              ? totalDisponible  // Si proceso excluido, el inventario queda intacto
              : totalDisponible - (usadoHastaAhora + usadoEnEsteProducto);

            // Actualizar uso global de inventario solo si no es proceso excluido
            if (!hasExcludedProcess && usadoEnEsteProducto > 0) {
              inventoryUsed.set(componentNorm, usadoHastaAhora + usadoEnEsteProducto);
            }
            
            let alerta: 'ok' | 'warning' | 'error' = 'ok';
            
            if (cantidadAProducir > 0) {
              alerta = 'error';
            } else if (productData.minimum_unit && quedaraDisponible < productData.minimum_unit) {
              alerta = 'warning';
            }
            
            componentAnalysis.push({
              component_id: componentId,
              cantidad_requerida: cantidadRequerida,
              cantidad_disponible: totalDisponible,
              cantidad_a_producir: cantidadAProducir,
              type: productData.type,
              minimum_unit: productData.minimum_unit,
              maximum_unit: productData.maximum_unit,
              quedara_disponible: quedaraDisponible,
              alerta
            });
            
            // Determinar si el componente tiene procesos definidos en machines_processes
            const componentHasProcesses = componentProcesses && componentProcesses.size > 0;

            // Incluir referencias -CMB aunque no tengan procesos propios
            const isCMBReference = componentId.endsWith('-CMB');

            // 🔍 DIAGNÓSTICO para refs críticas
            const isCriticalComp = ['DFCA30', 'T-CA30', 'TCHCA30', 'TSCA30', 'CCA30', 'CNCA30', 'PTCA-30'].includes(componentId);
            if (isCriticalComp) {
              console.log(`   🔍 DECISIÓN ${componentId}: componentHasProcesses=${componentHasProcesses}, isCMB=${isCMBReference}, será incluido=${componentHasProcesses || isCMBReference}`);
              console.log(`      componentProcesses lookup: direct=${componentProcessesMap.get(componentId)?.size ?? 'NONE'}, norm=${componentProcessesMap.get(componentNorm)?.size ?? 'NONE'}`);
            }

            // Agregar componentes que tengan procesos asociados O sean referencias -CMB
            if (componentHasProcesses || isCMBReference) {
              itemAdjusted.push({
                referencia: componentId,
                cantidad: cantidadRequerida,
                inventario: usadoEnEsteProducto
              });
            }
          }
          
          return {
            adjusted: itemAdjusted,
            analysis: {
              referencia: item.referencia,
              cantidad_original: item.cantidad,
              componentes: componentAnalysis
            }
          };
        });
        
        const batchResults = await Promise.all(batchPromises);
        
        // Agregar resultados del lote
        for (const result of batchResults) {
          adjustedProductionData.push(...result.adjusted);
          if (result.analysis) {
            results.push(result.analysis);
          }
        }
        
        // Actualizar progreso
        const processedItems = Math.min(i + BATCH_SIZE, totalItems);
        setProgress((processedItems / totalItems) * 100);
      }
      
      setAdjustedReferences(results);
      
      // 📊 Debug antes de onAdjustmentComplete
      const csvRoots = new Set(
        data.map(d => d.referencia.trim().toUpperCase())
      );
      const adjustedRoots = new Set(
        adjustedProductionData.map(a => a.referencia)
      );

      console.log("\n📊 === RESUMEN FINAL INVENTORY ADJUSTMENT ===");
      console.log("📊 CSV - total filas:", data.length);
      console.log("📊 CSV - refs únicas:", csvRoots.size);
      console.log("📊 adjustedData - total items:", adjustedProductionData.length);
      console.log("📊 adjustedData - refs únicas:", adjustedRoots.size);

      // Verificar que todas las referencias del CSV lleguen
      const missingFromAdjusted = [...csvRoots].filter(r => !adjustedRoots.has(r));
      if (missingFromAdjusted.length > 0) {
        console.log("⚠️ Referencias del CSV que NO están en adjustedData:", missingFromAdjusted.slice(0, 20));
      } else {
        console.log("✅ Todas las referencias del CSV están en adjustedData");
      }
      
      onAdjustmentComplete(adjustedProductionData);
      
      console.log(`✅ Ajuste completado: ${adjustedProductionData.length} referencias ajustadas`);
      
      toast.success("Ajuste de inventario completado", {
        description: `Se procesaron ${adjustedProductionData.length} referencias en ${results.length} productos terminados`
      });
      
    } catch (error) {
      console.error('❌ Error en ajuste de inventario:', error);
      setError('Error al procesar el ajuste de inventario');
      toast.error("Error al procesar el ajuste de inventario");
    }
    
    setLoading(false);
    setProgress(100);
  };

  const getAlertVariant = (alerta: string) => {
    switch (alerta) {
      case 'ok': return 'default';
      case 'warning': return 'secondary';
      case 'error': return 'destructive';
      default: return 'default';
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8">
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-3">
              <div className="animate-spin h-8 w-8 border-b-2 border-primary"></div>
              <div className="text-center">
                <p className="font-medium">Procesando ajuste de inventario...</p>
                {currentReference && (
                  <p className="text-sm text-muted-foreground mt-1">
                    Analizando: {currentReference}
                  </p>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Progress value={progress} className="w-full" />
              <p className="text-xs text-center text-muted-foreground">
                {Math.round(progress)}% completado
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-destructive mb-4">{error}</p>
          <div className="flex gap-2 justify-center">
            <Button variant="outline" onClick={onBack}>Volver</Button>
            <Button onClick={processInventoryAdjustment}>Reintentar</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!useInventory) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Ajuste de Inventario
          </CardTitle>
          <CardDescription>
            El cálculo con inventario está desactivado. Se usarán las cantidades originales.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onBack}>
              Volver
            </Button>
            <Button onClick={onNext} className="flex-1">
              Continuar a Configuración de Operarios
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Ajuste de Inventario
          </CardTitle>
          <CardDescription>
            Resta automática de cantidades disponibles en inventario para determinar producción real necesaria
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onBack}>
              Volver
            </Button>
            <Button onClick={onNext} className="flex-1">
              Continuar a Configuración de Operarios
            </Button>
          </div>
        </CardContent>
      </Card>

      {adjustedReferences.map((item, index) => {
        const isOpen = openReferences.has(index);
        const toggleOpen = () => {
          const newOpen = new Set(openReferences);
          if (isOpen) {
            newOpen.delete(index);
          } else {
            newOpen.add(index);
          }
          setOpenReferences(newOpen);
        };

        return (
          <Card key={index}>
            <Collapsible open={isOpen} onOpenChange={toggleOpen}>
              <CollapsibleTrigger className="w-full">
                <CardHeader className="cursor-pointer hover:bg-accent/50 transition-colors">
                  <CardTitle className="text-lg flex items-center gap-2 justify-between">
                    <div className="flex items-center gap-2">
                      <Package className="h-5 w-5" />
                      {item.referencia} - {item.cantidad_original.toLocaleString()} unidades solicitadas
                    </div>
                    {isOpen ? (
                      <ChevronDown className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    )}
                  </CardTitle>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Componente</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead className="text-right">Requerido</TableHead>
                        <TableHead className="text-right">Disponible</TableHead>
                        <TableHead className="text-center">
                          <ArrowRight className="h-4 w-4 inline" />
                        </TableHead>
                        <TableHead className="text-right font-bold">A Producir</TableHead>
                        <TableHead className="text-right">Quedará</TableHead>
                        <TableHead>Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {item.componentes
                        .sort((a, b) => {
                          // Ordenar: PP primero, luego MP
                          const typeOrder = { 'PP': 1, 'MP': 2, 'PT': 3 };
                          const orderA = typeOrder[a.type as keyof typeof typeOrder] || 99;
                          const orderB = typeOrder[b.type as keyof typeof typeOrder] || 99;
                          return orderA - orderB;
                        })
                        .map((comp, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-medium">{comp.component_id}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{comp.type}</Badge>
                          </TableCell>
                          <TableCell className="text-right">{comp.cantidad_requerida.toLocaleString()}</TableCell>
                          <TableCell className="text-right">{comp.cantidad_disponible.toLocaleString()}</TableCell>
                          <TableCell className="text-center">
                            <ArrowRight className="h-4 w-4 inline text-muted-foreground" />
                          </TableCell>
                          <TableCell className="text-right font-bold text-primary">
                            {comp.type === 'MP' ? (
                              <span className="text-muted-foreground">N/A</span>
                            ) : (
                              comp.cantidad_a_producir.toLocaleString()
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <span className={comp.quedara_disponible < 0 ? 'text-destructive' : ''}>
                              {comp.quedara_disponible.toLocaleString()}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge variant={getAlertVariant(comp.alerta)}>
                              {comp.alerta === 'ok' ? '✓ OK' : 
                               comp.alerta === 'warning' ? '⚠ Bajo mínimo' : 
                               '✗ Falta stock'}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        );
      })}

      <div className="flex gap-2">
        <Button variant="outline" onClick={onBack}>
          Volver
        </Button>
        <Button onClick={onNext} className="flex-1">
          Continuar a Configuración de Operarios
        </Button>
      </div>
    </div>
  );
};
