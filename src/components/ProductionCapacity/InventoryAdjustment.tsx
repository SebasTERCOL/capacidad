import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Package, Minus, ArrowRight, Database } from "lucide-react";
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
}

interface InventoryAdjustmentProps {
  data: ProductionRequest[];
  onNext: () => void;
  onBack: () => void;
  onAdjustmentComplete: (adjustedData: AdjustedProductionData[]) => void;
}

export const InventoryAdjustment: React.FC<InventoryAdjustmentProps> = ({
  data,
  onNext,
  onBack,
  onAdjustmentComplete
}) => {
  const [adjustedReferences, setAdjustedReferences] = useState<AdjustedReference[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [currentReference, setCurrentReference] = useState<string>('');

  useEffect(() => {
    if (data.length > 0) {
      processInventoryAdjustment();
    }
  }, [data]);

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

  const processInventoryAdjustment = async () => {
    setLoading(true);
    setError(null);
    setProgress(0);
    
    try {
      const totalItems = data.length;
      console.log(`📦 Iniciando ajuste de inventario para ${totalItems} referencias`);
      
      // Paso 1: Obtener tipos de todas las referencias principales (batch query)
      const allReferences = data.map(item => item.referencia.trim().toUpperCase());
      const { data: mainProducts } = await supabase
        .from('products')
        .select('reference, type')
        .in('reference', allReferences);
      
      const mainProductsMap = new Map(
        mainProducts?.map(p => [p.reference.trim().toUpperCase(), p.type]) || []
      );
      
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
          
          const productType = mainProductsMap.get(ref);
          
          // Si no es PT, no se procesa
          if (productType !== 'PT') {
            return {
              adjusted: [{
                referencia: item.referencia,
                cantidad: item.cantidad
              }],
              analysis: null
            };
          }
          
          // Obtener BOM recursivo
          const allComponents = await getRecursiveBOM(ref, item.cantidad);
          
          if (allComponents.size === 0) {
            return {
              adjusted: [{
                referencia: item.referencia,
                cantidad: item.cantidad
              }],
              analysis: null
            };
          }
          
          // Obtener información de productos (batch query)
          const componentIds = Array.from(allComponents.keys());
          const { data: productsData } = await supabase
            .from('products')
            .select('reference, quantity, type, minimum_unit, maximum_unit')
            .in('reference', componentIds);
          
          const productsMap = new Map(
            productsData?.map(p => [p.reference.trim().toUpperCase(), p]) || []
          );
          
          const componentAnalysis: BOMComponent[] = [];
          const itemAdjusted: AdjustedProductionData[] = [];
          
          for (const [componentId, cantidadNecesaria] of allComponents) {
            const productData = productsMap.get(componentId);
            
            // Si no existe en products o es PT, no se ajusta
            if (!productData || productData.type === 'PT') {
              itemAdjusted.push({
                referencia: componentId,
                cantidad: Math.ceil(cantidadNecesaria)
              });
              continue;
            }
            
            const cantidadDisponible = productData.quantity || 0;
            const cantidadAProducir = Math.max(0, Math.ceil(cantidadNecesaria) - cantidadDisponible);
            const quedaraDisponible = cantidadDisponible - Math.ceil(cantidadNecesaria);
            
            let alerta: 'ok' | 'warning' | 'error' = 'ok';
            
            if (cantidadAProducir > 0) {
              alerta = 'error';
            } else if (productData.minimum_unit && quedaraDisponible < productData.minimum_unit) {
              alerta = 'warning';
            }
            
            componentAnalysis.push({
              component_id: componentId,
              cantidad_requerida: Math.ceil(cantidadNecesaria),
              cantidad_disponible: cantidadDisponible,
              cantidad_a_producir: cantidadAProducir,
              type: productData.type,
              minimum_unit: productData.minimum_unit,
              maximum_unit: productData.maximum_unit,
              quedara_disponible: quedaraDisponible,
              alerta
            });
            
            // Solo agregar a producción lo que falta
            if (cantidadAProducir > 0) {
              itemAdjusted.push({
                referencia: componentId,
                cantidad: cantidadAProducir
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
      </Card>

      {adjustedReferences.map((item, index) => (
        <Card key={index}>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Package className="h-5 w-5" />
              {item.referencia} - {item.cantidad_original.toLocaleString()} unidades solicitadas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Componente</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Requerido</TableHead>
                  <TableHead className="text-right">Disponible</TableHead>
                  <TableHead className="text-center">
                    <Minus className="h-4 w-4 inline" />
                  </TableHead>
                  <TableHead className="text-right font-bold">A Producir</TableHead>
                  <TableHead className="text-right">Quedará</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {item.componentes.map((comp, idx) => (
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
                      {comp.cantidad_a_producir.toLocaleString()}
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
        </Card>
      ))}

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
