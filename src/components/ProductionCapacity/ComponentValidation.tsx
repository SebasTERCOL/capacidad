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

  useEffect(() => {
    if (data.length > 0) {
      validateComponents();
    }
  }, [data]);

  const validateComponents = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const results: ComponentInfo[] = [];
      
      for (const item of data) {
        // Buscar BOM para esta referencia
          const ref = item.referencia.trim();
          // Allow matches even if product_id in DB has extra spaces or minor variations
          const escapedRef = ref.replace(/[%_]/g, '\\$&');
          const pattern = `%${escapedRef}%`;
          const { data: bomData, error: bomError } = await supabase
            .from('bom')
            .select('component_id, amount, product_id')
            .ilike('product_id', pattern);
        
        if (bomError) {
          console.error('Error fetching BOM:', bomError);
          continue;
        }
        
        if (!bomData || bomData.length === 0) {
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
        
        const componentValidation = [];
        
        for (const bomItem of bomData) {
          // Buscar información del componente
          const { data: productData, error: productError } = await supabase
            .from('products')
            .select('reference, quantity, minimum_unit, maximum_unit')
            .eq('reference', bomItem.component_id)
            .single();
          
          if (productError || !productData) {
            componentValidation.push({
              component_id: bomItem.component_id,
              amount: bomItem.amount,
              cantidadDisponible: 0,
              cantidadNecesaria: item.cantidad * bomItem.amount,
              minimum_unit: null,
              maximum_unit: null,
              alerta: 'error' as const,
              mensaje: 'Componente no encontrado en inventario'
            });
            continue;
          }
          
          const cantidadNecesaria = item.cantidad * bomItem.amount;
          const cantidadDisponible = productData.quantity;
          
          let alerta: 'ok' | 'warning' | 'error' = 'ok';
          let mensaje = 'Stock suficiente';
          
          if (cantidadNecesaria > cantidadDisponible) {
            alerta = 'error';
            mensaje = `Falta stock: ${cantidadNecesaria - cantidadDisponible} unidades`;
          } else if (productData.minimum_unit && cantidadDisponible - cantidadNecesaria < productData.minimum_unit) {
            alerta = 'warning';
            mensaje = `Quedará por debajo del mínimo (${productData.minimum_unit})`;
          } else if (productData.maximum_unit && cantidadDisponible > productData.maximum_unit) {
            alerta = 'warning';
            mensaje = `Stock actual supera el máximo (${productData.maximum_unit})`;
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
      }
      
      setValidation(results);
      onValidationComplete(results);
    } catch (error) {
      console.error('Error validating components:', error);
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