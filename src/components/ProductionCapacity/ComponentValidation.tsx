import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle, XCircle, Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ProductionRequest } from "./FileUpload";

interface ComponentInfo {
  referencia: string;
  cantidadRequerida: number;
  componentes: {
    component_id: string;
    amount: number;
    cantidadDisponible: number;
    cantidadNecesaria: number;
    minimum_unit: number | null;
    maximum_unit: number | null;
    alerta: 'ok' | 'warning' | 'error';
    mensaje: string;
  }[];
}

interface ComponentValidationProps {
  data: ProductionRequest[];
  onNext: () => void;
  onBack: () => void;
  onValidationComplete: (validation: ComponentInfo[]) => void;
}

export const ComponentValidation: React.FC<ComponentValidationProps> = ({ 
  data, 
  onNext, 
  onBack, 
  onValidationComplete 
}) => {
  const [validation, setValidation] = useState<ComponentInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debugMode, setDebugMode] = useState(true); // Enable debug mode by default
  const [debugLogs, setDebugLogs] = useState<string[]>([]);

  useEffect(() => {
    if (data.length > 0) {
      validateComponents();
    }
  }, [data]);

  const addDebugLog = (message: string) => {
    if (debugMode) {
      setDebugLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
      console.log(message);
    }
  };

  const validateComponents = async () => {
    setLoading(true);
    setError(null);
    setDebugLogs([]);
    
    addDebugLog(`🚀 Iniciando validación de ${data.length} referencias`);
    addDebugLog(`📄 Datos de entrada: ${JSON.stringify(data)}`);
    
    try {
      const results: ComponentInfo[] = [];
      
      for (const item of data) {
        const ref = item.referencia.trim().toUpperCase();
        addDebugLog(`🔍 Procesando referencia: ${ref} (cantidad: ${item.cantidad})`);
        
        // Validar datos de entrada
        if (!item.referencia || item.referencia.trim() === '') {
          addDebugLog(`❌ Referencia vacía detectada`);
          continue;
        }
        
        if (!item.cantidad || item.cantidad <= 0) {
          addDebugLog(`❌ Cantidad inválida para ${ref}: ${item.cantidad}`);
          continue;
        }
        
        // Buscar BOM para esta referencia con múltiples estrategias
        let bomData: any[] = [];
        let bomError: any = null;
        
        addDebugLog(`🔎 Búsqueda 1: Coincidencia exacta para "${ref}"`);
        // Estrategia 1: Coincidencia exacta
        const { data: exactData, error: exactError } = await supabase
          .from('bom')
          .select('component_id, amount, product_id')
          .eq('product_id', ref);
        
        if (exactData && exactData.length > 0) {
          bomData = exactData;
          addDebugLog(`✅ Estrategia 1 exitosa: ${bomData.length} componentes encontrados`);
        } else {
          addDebugLog(`⚠️ Estrategia 1 sin resultados, probando ILIKE`);
          // Estrategia 2: Búsqueda con ILIKE (contiene)
          const { data: ilikeData, error: ilikeError } = await supabase
            .from('bom')
            .select('component_id, amount, product_id')
            .ilike('product_id', `%${ref}%`);
          
          if (ilikeData && ilikeData.length > 0) {
            bomData = ilikeData;
            addDebugLog(`✅ Estrategia 2 exitosa: ${bomData.length} componentes encontrados`);
          } else {
            addDebugLog(`⚠️ Estrategia 2 sin resultados, probando búsqueda manual`);
            // Estrategia 3: Búsqueda case-insensitive con trim
            const { data: allBomData, error: allBomError } = await supabase
              .from('bom')
              .select('component_id, amount, product_id');
            
            if (allBomData) {
              const filteredData = allBomData.filter(bom => 
                bom.product_id?.trim().toUpperCase() === ref
              );
              bomData = filteredData;
              addDebugLog(`🔧 Estrategia 3: ${filteredData.length} componentes tras filtro manual de ${allBomData.length} registros`);
            }
            bomError = allBomError;
          }
        }
        
        if (bomError) {
          addDebugLog(`❌ Error en consulta BOM: ${JSON.stringify(bomError)}`);
          continue;
        }
        
        if (!bomData || bomData.length === 0) {
          addDebugLog(`❌ BOM no encontrado para ${ref} - agregando componente N/A`);
          results.push({
            referencia: item.referencia,
            cantidadRequerida: item.cantidad,
            componentes: [{
              component_id: 'N/A',
              amount: 0,
              cantidadDisponible: 0,
              cantidadNecesaria: 0,
              minimum_unit: null,
              maximum_unit: null,
              alerta: 'warning',
              mensaje: 'No se encontró BOM para esta referencia'
            }]
          });
          continue;
        }
        
        addDebugLog(`📋 BOM encontrado para ${ref}: ${JSON.stringify(bomData)}`);
        const componentValidation = [];
        
        // Obtener todos los productos de una vez para mejor performance
        const componentIds = bomData.map(bom => bom.component_id);
        addDebugLog(`🔍 Buscando productos para componentes: ${componentIds.join(', ')}`);
        
        const { data: productsData, error: productsError } = await supabase
          .from('products')
          .select('reference, quantity, minimum_unit, maximum_unit')
          .in('reference', componentIds);
        
        if (productsError) {
          addDebugLog(`❌ Error consultando productos: ${JSON.stringify(productsError)}`);
          continue;
        }
        
        addDebugLog(`📦 Productos encontrados: ${productsData?.length || 0} de ${componentIds.length}`);
        
        const productsMap = new Map(
          productsData?.map(p => [p.reference, p]) || []
        );
        
        for (const bomItem of bomData) {
          const productData = productsMap.get(bomItem.component_id);
          
          if (!productData) {
            addDebugLog(`⚠️ Producto ${bomItem.component_id} no encontrado en inventario`);
            componentValidation.push({
              component_id: bomItem.component_id,
              amount: bomItem.amount,
              cantidadDisponible: 0,
              cantidadNecesaria: Math.ceil(item.cantidad * bomItem.amount),
              minimum_unit: null,
              maximum_unit: null,
              alerta: 'error' as const,
              mensaje: 'Componente no encontrado en inventario'
            });
            continue;
          }
          
          const cantidadNecesaria = Math.ceil(item.cantidad * bomItem.amount);
          const cantidadDisponible = productData.quantity || 0;
          
          addDebugLog(`📊 ${bomItem.component_id}: necesario=${cantidadNecesaria}, disponible=${cantidadDisponible}, min=${productData.minimum_unit}, max=${productData.maximum_unit}`);
          
          let alerta: 'ok' | 'warning' | 'error' = 'ok';
          let mensaje = 'Stock suficiente';
          
          if (cantidadNecesaria > cantidadDisponible) {
            alerta = 'error';
            mensaje = `Falta stock: ${(cantidadNecesaria - cantidadDisponible).toLocaleString()} unidades`;
            addDebugLog(`❌ ${bomItem.component_id}: Stock insuficiente`);
          } else if (productData.minimum_unit && (cantidadDisponible - cantidadNecesaria) < productData.minimum_unit) {
            alerta = 'warning';
            mensaje = `Quedará por debajo del mínimo (${productData.minimum_unit.toLocaleString()})`;
            addDebugLog(`⚠️ ${bomItem.component_id}: Quedará por debajo del mínimo`);
          } else if (productData.maximum_unit && cantidadDisponible > productData.maximum_unit) {
            alerta = 'warning';
            mensaje = `Stock actual supera el máximo (${productData.maximum_unit.toLocaleString()})`;
            addDebugLog(`⚠️ ${bomItem.component_id}: Stock supera el máximo`);
          } else {
            addDebugLog(`✅ ${bomItem.component_id}: Stock OK`);
          }
          
          componentValidation.push({
            component_id: bomItem.component_id,
            amount: bomItem.amount,
            cantidadDisponible,
            cantidadNecesaria,
            minimum_unit: productData.minimum_unit,
            maximum_unit: productData.maximum_unit,
            alerta,
            mensaje
          });
        }
        
        results.push({
          referencia: item.referencia,
          cantidadRequerida: item.cantidad,
          componentes: componentValidation
        });
        
        addDebugLog(`✅ Validación completada para ${ref}: ${componentValidation.length} componentes procesados`);
      }
      
      addDebugLog(`🎉 Proceso completo: ${results.length} referencias validadas`);
      setValidation(results);
      onValidationComplete(results);
      
    } catch (error) {
      console.error('💥 Error validating components:', error);
      setError('Error al validar componentes. Verifique la conexión a la base de datos.');
    }
    
    setLoading(false);
  };

  const getAlertIcon = (alerta: string) => {
    switch (alerta) {
      case 'ok': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'warning': return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'error': return <XCircle className="h-4 w-4 text-red-500" />;
      default: return null;
    }
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
          <p>Validando componentes...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <XCircle className="h-8 w-8 text-red-500 mx-auto mb-4" />
          <p className="text-red-500 mb-4">{error}</p>
          <Button onClick={() => validateComponents()}>Reintentar</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {debugMode && debugLogs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-sm">
              🔧 Panel de Depuración
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setDebugLogs([])}
              >
                Limpiar
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-60 overflow-y-auto">
            <div className="text-xs font-mono space-y-1 bg-muted p-3 rounded">
              {debugLogs.map((log, index) => (
                <div key={index} className="text-muted-foreground">
                  {log}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Validación de Componentes
          </CardTitle>
          <CardDescription>
            Verificación de disponibilidad de componentes según el BOM
          </CardDescription>
        </CardHeader>
      </Card>

      {validation.map((item, index) => (
        <Card key={index}>
          <CardHeader>
            <CardTitle className="text-lg">
              {item.referencia} - {item.cantidadRequerida.toLocaleString()} unidades
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Componente</TableHead>
                  <TableHead className="text-right">Req/Unidad</TableHead>
                  <TableHead className="text-right">Total Necesario</TableHead>
                  <TableHead className="text-right">Disponible</TableHead>
                  <TableHead className="text-right">Min/Max</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {item.componentes.map((comp, compIndex) => (
                  <TableRow key={compIndex}>
                    <TableCell className="font-medium">{comp.component_id}</TableCell>
                    <TableCell className="text-right">{comp.amount}</TableCell>
                    <TableCell className="text-right">{comp.cantidadNecesaria.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{comp.cantidadDisponible.toLocaleString()}</TableCell>
                    <TableCell className="text-right">
                      {comp.minimum_unit || comp.maximum_unit ? 
                        `${comp.minimum_unit || 0} / ${comp.maximum_unit || '∞'}` : 
                        'N/A'
                      }
                    </TableCell>
                    <TableCell>
                      <Badge variant={getAlertVariant(comp.alerta)} className="flex items-center gap-1 w-fit">
                        {getAlertIcon(comp.alerta)}
                        {comp.mensaje}
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
          Continuar a Proyección de Producción
        </Button>
      </div>
    </div>
  );
};