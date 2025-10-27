import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
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

  useEffect(() => {
    if (data.length > 0) {
      processInventoryAdjustment();
    }
  }, [data]);

  // Función recursiva para obtener BOM (igual que en ComponentValidation)
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
    
    const { data: bomData, error: bomError } = await supabase
      .from('bom')
      .select('component_id, amount')
      .eq('product_id', productId.trim().toUpperCase());
    
    if (bomError || !bomData || bomData.length === 0) {
      return componentsMap;
    }
    
    for (const bomItem of bomData) {
      const componentId = bomItem.component_id.trim().toUpperCase();
      const componentQuantity = quantity * bomItem.amount;
      
      const existingQuantity = componentsMap.get(componentId) || 0;
      componentsMap.set(componentId, existingQuantity + componentQuantity);
      
      const subComponents = await getRecursiveBOM(
        componentId, 
        componentQuantity, 
        level + 1, 
        new Set(visited)
      );
      
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
    
    try {
      const results: AdjustedReference[] = [];
      const adjustedProductionData: AdjustedProductionData[] = [];
      
      for (const item of data) {
        const ref = item.referencia.trim().toUpperCase();
        
        console.log(`🔄 Procesando ajuste de inventario para: ${ref}`);
        
        // Verificar si la referencia principal es PT
        const { data: mainProduct } = await supabase
          .from('products')
          .select('type')
          .eq('reference', ref)
          .single();
        
        if (!mainProduct || mainProduct.type !== 'PT') {
          console.log(`⚠️ ${ref} no es PT, se omite ajuste de inventario`);
          adjustedProductionData.push({
            referencia: item.referencia,
            cantidad: item.cantidad
          });
          continue;
        }
        
        // Obtener BOM recursivo
        const allComponents = await getRecursiveBOM(ref, item.cantidad);
        
        if (allComponents.size === 0) {
          adjustedProductionData.push({
            referencia: item.referencia,
            cantidad: item.cantidad
          });
          continue;
        }
        
        const componentAnalysis: BOMComponent[] = [];
        
        // Obtener información de productos
        const componentIds = Array.from(allComponents.keys());
        const { data: productsData } = await supabase
          .from('products')
          .select('reference, quantity, type, minimum_unit, maximum_unit')
          .in('reference', componentIds);
        
        const productsMap = new Map(
          productsData?.map(p => [p.reference.trim().toUpperCase(), p]) || []
        );
        
        for (const [componentId, cantidadNecesaria] of allComponents) {
          const productData = productsMap.get(componentId);
          
          // Si no existe en products o es PT, no se ajusta
          if (!productData || productData.type === 'PT') {
            adjustedProductionData.push({
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
            adjustedProductionData.push({
              referencia: componentId,
              cantidad: cantidadAProducir
            });
          }
        }
        
        results.push({
          referencia: item.referencia,
          cantidad_original: item.cantidad,
          componentes: componentAnalysis
        });
      }
      
      setAdjustedReferences(results);
      onAdjustmentComplete(adjustedProductionData);
      
      toast.success("Ajuste de inventario completado", {
        description: `Se procesaron ${adjustedProductionData.length} referencias ajustadas`
      });
      
    } catch (error) {
      console.error('Error en ajuste de inventario:', error);
      setError('Error al procesar el ajuste de inventario');
      toast.error("Error al procesar el ajuste de inventario");
    }
    
    setLoading(false);
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
        <CardContent className="p-8 text-center">
          <div className="animate-spin h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p>Procesando ajuste de inventario...</p>
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
