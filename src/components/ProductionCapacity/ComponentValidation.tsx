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
    machineOccupancy?: number;
    processOccupancy?: number;
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
  useEffect(() => {
    if (data.length > 0) {
      validateComponents();
    }
  }, [data]);

  // Calcular horas disponibles del mes actual
  const calculateMonthlyHours = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    let weekdays = 0;
    let saturdays = 0;
    
    for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
      const dayOfWeek = d.getDay();
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        weekdays++;
      } else if (dayOfWeek === 6) {
        saturdays++;
      }
    }
    
    const weekdayHours = weekdays * ((7.584 - 0.4167) + (7.617 - 0.4167) + (8.8 - 0.4167));
    const saturdayHours = saturdays * ((6.0834 - 0.4167) + (5.917 - 0.4167));
    
    return weekdayHours + saturdayHours;
  };

  const monthlyHours = calculateMonthlyHours();

  // Función recursiva para obtener todos los componentes del BOM
  const getRecursiveBOM = async (productId: string, quantity: number = 1, level: number = 0, visited: Set<string> = new Set()): Promise<Map<string, number>> => {
    // Prevenir loops infinitos
    if (level > 10 || visited.has(productId)) {
      console.warn(`🔄 Loop detectado o nivel máximo alcanzado para ${productId}`);
      return new Map();
    }
    
    visited.add(productId);
    const componentsMap = new Map<string, number>();
    
    console.log(`${'  '.repeat(level)}🔍 Buscando BOM para: ${productId} (cantidad: ${quantity})`);
    
    // Buscar BOM directo para este product_id
    const { data: bomData, error: bomError } = await supabase
      .from('bom')
      .select('component_id, amount')
      .eq('product_id', productId.trim().toUpperCase());
    
    if (bomError) {
      console.error(`❌ Error al buscar BOM para ${productId}:`, bomError);
      return componentsMap;
    }
    
    if (!bomData || bomData.length === 0) {
      console.log(`${'  '.repeat(level)}📦 ${productId} es un componente final`);
      return componentsMap;
    }
    
    // Procesar cada componente
    for (const bomItem of bomData) {
      const componentId = bomItem.component_id.trim().toUpperCase();
      const componentQuantity = quantity * bomItem.amount;
      
      console.log(`${'  '.repeat(level)}📋 Encontrado componente: ${componentId} (cantidad: ${componentQuantity})`);
      
      // Agregar este componente al mapa
      const existingQuantity = componentsMap.get(componentId) || 0;
      componentsMap.set(componentId, existingQuantity + componentQuantity);
      
      // Buscar recursivamente si este componente tiene sus propios subcomponentes
      const subComponents = await getRecursiveBOM(componentId, componentQuantity, level + 1, new Set(visited));
      
      // Agregar los subcomponentes al mapa principal
      for (const [subComponentId, subQuantity] of subComponents) {
        const existingSubQuantity = componentsMap.get(subComponentId) || 0;
        componentsMap.set(subComponentId, existingSubQuantity + subQuantity);
      }
    }
    
    return componentsMap;
  };

  const validateComponents = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const results: ComponentInfo[] = [];
      
      // Obtener datos de machines_processes para cálculos de ocupación
      const { data: machineProcessData } = await supabase
        .from('machines_processes')
        .select(`
          ref, 
          sam, 
          id_machine, 
          id_process,
          machines!inner(id, name, status),
          processes!inner(id, name)
        `);
      
      // Crear mapas para búsqueda eficiente
      const machineProcessMap = new Map();
      if (machineProcessData) {
        machineProcessData.forEach(mp => {
          if (!machineProcessMap.has(mp.ref)) {
            machineProcessMap.set(mp.ref, []);
          }
          machineProcessMap.get(mp.ref).push(mp);
        });
      }
      
      for (const item of data) {
        const ref = item.referencia.trim().toUpperCase();
        
        // Validar datos de entrada
        if (!item.referencia || item.referencia.trim() === '') {
          continue;
        }
        
        if (!item.cantidad || item.cantidad <= 0) {
          continue;
        }
        
        console.log(`🚀 Iniciando análisis recursivo de BOM para: ${ref}`);
        
        // Obtener todos los componentes recursivos
        const allComponents = await getRecursiveBOM(ref, item.cantidad);
        
        if (allComponents.size === 0) {
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
              mensaje: 'No se encontró BOM para esta referencia',
              machineOccupancy: 0,
              processOccupancy: 0
            }]
          });
          continue;
        }
        
        const componentValidation = [];
        
        // Obtener todos los productos de una vez para mejor performance
        const componentIds = Array.from(allComponents.keys());
        console.log(`📦 Componentes encontrados para ${ref}:`, componentIds);
        
        const { data: productsData, error: productsError } = await supabase
          .from('products')
          .select('reference, quantity, minimum_unit, maximum_unit')
          .in('reference', componentIds);
        
        if (productsError) {
          console.error(`❌ Error al obtener productos:`, productsError);
          continue;
        }
        
        const productsMap = new Map(
          productsData?.map(p => [p.reference.trim().toUpperCase(), p]) || []
        );
        
        // Procesar cada componente del BOM recursivo
        for (const [componentId, totalQuantity] of allComponents) {
          const productData = productsMap.get(componentId);
          
          if (!productData) {
            componentValidation.push({
              component_id: componentId,
              amount: totalQuantity / item.cantidad, // Cantidad promedio por unidad principal
              cantidadDisponible: 0,
              cantidadNecesaria: Math.ceil(totalQuantity),
              minimum_unit: null,
              maximum_unit: null,
              alerta: 'error' as const,
              mensaje: 'Componente no encontrado en inventario',
              machineOccupancy: 0,
              processOccupancy: 0
            });
            continue;
          }
          
          const cantidadNecesaria = Math.ceil(totalQuantity);
          const cantidadDisponible = productData.quantity || 0;
          
          let alerta: 'ok' | 'warning' | 'error' = 'ok';
          let mensaje = 'Stock suficiente';
          
          if (cantidadNecesaria > cantidadDisponible) {
            alerta = 'error';
            mensaje = `Falta stock: ${(cantidadNecesaria - cantidadDisponible).toLocaleString()} unidades`;
          } else if (productData.minimum_unit && (cantidadDisponible - cantidadNecesaria) < productData.minimum_unit) {
            alerta = 'warning';
            mensaje = `Quedará por debajo del mínimo (${productData.minimum_unit.toLocaleString()})`;
          } else if (productData.maximum_unit && cantidadDisponible > productData.maximum_unit) {
            alerta = 'warning';
            mensaje = `Stock actual supera el máximo (${productData.maximum_unit.toLocaleString()})`;
          }

          // Calcular porcentajes de ocupación para el componente
          let machineOccupancy = 0;
          let processOccupancy = 0;

          // Buscar procesos para este componente específico
          let componentMachineProcesses = machineProcessMap.get(componentId);
          
          // Si no se encuentra por component_id, intentar con la referencia principal
          if (!componentMachineProcesses || componentMachineProcesses.length === 0) {
            componentMachineProcesses = machineProcessMap.get(ref);
          }
          
          // También intentar búsquedas parciales para referencias similares
          if (!componentMachineProcesses || componentMachineProcesses.length === 0) {
            for (const [mapRef, processes] of machineProcessMap) {
              if (mapRef.includes(componentId) || mapRef.includes(ref) || componentId.includes(mapRef)) {
                componentMachineProcesses = processes;
                console.log(`🔍 Encontrado proceso por búsqueda parcial: ${mapRef} para componente: ${componentId}`);
                break;
              }
            }
          }

          if (componentMachineProcesses && componentMachineProcesses.length > 0) {
            // Buscar el proceso con SAM > 0
            const mp = componentMachineProcesses.find(p => p.sam > 0) || componentMachineProcesses[0];
            console.log(`📊 Calculando ocupación para ${componentId}: SAM=${mp.sam}, Cantidad=${cantidadNecesaria}, Máquina=${mp.machines?.name}`);
            
            if (mp.sam > 0 && mp.machines?.status === 'ENCENDIDO') {
              // Manejar casos especiales para procesos donde SAM está en minutos/unidad
              const isMinutesPerUnitProcess = mp.processes?.name === 'Inyección' || mp.processes?.name === 'RoscadoConectores';
              const timeRequiredMinutes = isMinutesPerUnitProcess 
                ? cantidadNecesaria * mp.sam  // Para Inyección/RoscadoConectores: tiempo = cantidad × SAM
                : cantidadNecesaria / mp.sam; // Para otros: tiempo = cantidad ÷ SAM
              
              const timeRequiredHours = timeRequiredMinutes / 60;
              
              machineOccupancy = Math.min((timeRequiredHours / monthlyHours) * 100, 100);
              processOccupancy = machineOccupancy; // Por simplicidad, usar el mismo valor
              
              console.log(`⏰ Ocupación calculada para ${componentId} (${mp.processes?.name}): ${machineOccupancy.toFixed(2)}% (${timeRequiredHours.toFixed(2)}h de ${monthlyHours.toFixed(2)}h)`);
            } else {
              console.log(`⚠️ No se pudo calcular ocupación: SAM=${mp.sam}, Status=${mp.machines?.status}`);
            }
          } else {
            console.log(`❌ No se encontraron procesos para componente: ${componentId} ni para ref: ${ref}`);
          }
          
          componentValidation.push({
            component_id: componentId,
            amount: totalQuantity / item.cantidad, // Cantidad promedio por unidad principal
            cantidadDisponible,
            cantidadNecesaria,
            minimum_unit: productData.minimum_unit,
            maximum_unit: productData.maximum_unit,
            alerta,
            mensaje,
            machineOccupancy,
            processOccupancy
          });
        }
        
        results.push({
          referencia: item.referencia,
          cantidadRequerida: item.cantidad,
          componentes: componentValidation
        });
      }
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
                  <TableHead className="text-right">Ocupación Máq.</TableHead>
                  <TableHead className="text-right">Ocupación Proc.</TableHead>
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
                      <Badge variant={comp.machineOccupancy > 80 ? 'destructive' : comp.machineOccupancy > 60 ? 'secondary' : 'default'}>
                        {comp.machineOccupancy?.toFixed(1) || '0.0'}%
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant={comp.processOccupancy > 80 ? 'destructive' : comp.processOccupancy > 60 ? 'secondary' : 'default'}>
                        {comp.processOccupancy?.toFixed(1) || '0.0'}%
                      </Badge>
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