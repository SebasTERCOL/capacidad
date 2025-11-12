import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Boxes, ArrowLeft, ArrowRight, Loader2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AdjustedProductionData } from "./InventoryAdjustment";
import { toast } from "@/components/ui/sonner";

export interface ComboSuggestion {
  comboName: string;
  cycleTime: number;
  components: {
    componentId: string;
    quantityPerCombo: number;
    totalRequired: number;
    currentInventory: number;
  }[];
  suggestedCombos: number;
  totalTime: number;
}

interface ComboConfigurationProps {
  data: AdjustedProductionData[];
  onNext: () => void;
  onBack: () => void;
  onComboConfigComplete: (combos: ComboSuggestion[]) => void;
}

export const ComboConfiguration: React.FC<ComboConfigurationProps> = ({
  data,
  onNext,
  onBack,
  onComboConfigComplete
}) => {
  const [combos, setCombos] = useState<ComboSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    calculateComboSuggestions();
  }, [data]);

  // Función recursiva para obtener todos los componentes del BOM
  const getRecursiveBOM = async (productId: string, quantity: number = 1, level: number = 0, visited: Set<string> = new Set()): Promise<Map<string, number>> => {
    // Prevenir loops infinitos
    if (level > 10 || visited.has(productId)) {
      console.warn(`🔄 Loop detectado o nivel máximo alcanzado para ${productId}`);
      return new Map();
    }
    
    visited.add(productId);
    const componentsMap = new Map<string, number>();
    
    console.log(`${'  '.repeat(level)}🔍 [BOM] Analizando: ${productId} (cantidad: ${quantity})`);
    
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
      console.log(`${'  '.repeat(level)}📦 ${productId} es componente final (sin BOM)`);
      return componentsMap;
    }
    
    // Procesar cada componente
    for (const bomItem of bomData) {
      const componentId = bomItem.component_id.trim().toUpperCase();
      const componentQuantity = quantity * bomItem.amount;
      
      console.log(`${'  '.repeat(level)}📋 Componente: ${componentId} (cantidad: ${componentQuantity})`);
      
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

  const calculateComboSuggestions = async () => {
    setLoading(true);
    setError(null);
    
    try {
      console.log('🔧 [COMBO CONFIG] Iniciando cálculo de combos...');
      console.log(`📋 [COMBO CONFIG] Procesando ${data.length} referencias del pedido`);
      
      // 1. Hacer desglose BOM completo de todas las referencias del pedido
      const allRequiredComponents = new Map<string, number>();
      
      for (const item of data) {
        console.log(`\n🎯 [COMBO CONFIG] Analizando ${item.referencia} (cantidad: ${item.cantidad})`);
        const bomComponents = await getRecursiveBOM(item.referencia, item.cantidad);
        
        // Consolidar componentes
        for (const [componentId, quantity] of bomComponents) {
          const existing = allRequiredComponents.get(componentId) || 0;
          allRequiredComponents.set(componentId, existing + quantity);
        }
      }
      
      console.log(`\n📊 [COMBO CONFIG] Total de componentes únicos encontrados: ${allRequiredComponents.size}`);
      
      // 2. Filtrar solo las referencias que terminan en -CMB
      const cmbReferences: Array<{ ref: string; quantity: number }> = [];
      for (const [componentId, quantity] of allRequiredComponents) {
        if (componentId.endsWith('-CMB')) {
          cmbReferences.push({ ref: componentId, quantity });
          console.log(`🎯 [COMBO CONFIG] Referencia -CMB encontrada: ${componentId} (cantidad: ${quantity})`);
        }
      }
      
      console.log(`\n📦 [COMBO CONFIG] ${cmbReferences.length} referencias -CMB necesarias`);
      
      if (cmbReferences.length === 0) {
        console.log('✅ [COMBO CONFIG] No hay referencias -CMB, saltando configuración');
        setCombos([]);
        setLoading(false);
        return;
      }
      
      const comboMap = new Map<string, ComboSuggestion>();
      
      // 3. Para cada referencia -CMB, buscar en qué combos está
      for (const ref of cmbReferences) {
        console.log(`\n🔍 [COMBO CONFIG] Buscando combos para ${ref.ref}...`);
        
        const { data: comboData, error: comboError } = await supabase
          .from('combo' as any)
          .select('*')
          .eq('component_id', ref.ref);
        
        if (comboError) {
          console.error('❌ Error consultando combo:', comboError);
          continue;
        }
        
        if (!comboData || comboData.length === 0) {
          console.warn(`⚠️ [COMBO CONFIG] No se encontraron combos para ${ref.ref}`);
          continue;
        }
        
        console.log(`✅ [COMBO CONFIG] ${comboData.length} combo(s) encontrado(s) para ${ref.ref}`);
        
        for (const combo of comboData as any[]) {
          // 4. Si el combo ya fue procesado, actualizar requisitos
          if (comboMap.has(combo.combo)) {
            const existing = comboMap.get(combo.combo)!;
            
            // Recalcular cuántos combos se necesitan considerando TODAS las referencias
            let maxCombosNeeded = existing.suggestedCombos;
            
            // Verificar si necesitamos más combos para esta referencia
            const combosForThisRef = Math.ceil(ref.quantity / combo.cantidad);
            if (combosForThisRef > maxCombosNeeded) {
              maxCombosNeeded = combosForThisRef;
            }
            
            existing.suggestedCombos = maxCombosNeeded;
            existing.totalTime = maxCombosNeeded * existing.cycleTime;
            
            // Actualizar totales de componentes
            existing.components = existing.components.map(c => ({
              ...c,
              totalRequired: maxCombosNeeded * c.quantityPerCombo
            }));
            
            console.log(`🔄 [COMBO CONFIG] Combo ${combo.combo} actualizado: ${maxCombosNeeded} combos`);
            continue;
          }
          
          // 5. Obtener tiempo del combo desde machines_processes donde id_process = 20 (Punzonado)
          const { data: timeData, error: timeError } = await supabase
            .from('machines_processes')
            .select('sam, ref')
            .eq('ref', combo.combo)
            .eq('id_process', 20)
            .limit(1)
            .maybeSingle();
          
          if (timeError) {
            console.warn(`⚠️ [COMBO CONFIG] Error buscando tiempo para combo ${combo.combo}:`, timeError);
          }
          
          const cycleTime = timeData?.sam || 0;
          
          if (cycleTime === 0) {
            console.warn(`⚠️ [COMBO CONFIG] No se encontró tiempo para combo ${combo.combo} en proceso Punzonado (id_process=20)`);
          }
          
          // 6. Obtener TODOS los componentes de este combo
          const { data: allComponents, error: allCompError } = await supabase
            .from('combo' as any)
            .select('*')
            .eq('combo', combo.combo);
          
          if (allCompError || !allComponents) {
            console.error(`❌ Error obteniendo componentes del combo ${combo.combo}:`, allCompError);
            continue;
          }
          
          // 7. Calcular cuántos combos se necesitan basado en la referencia actual
          const requiredCombos = Math.ceil(ref.quantity / combo.cantidad);
          
          // 8. Obtener inventario de cada componente (opcional, por ahora en 0)
          const componentsWithInventory = (allComponents as any[]).map(c => ({
            componentId: c.component_id,
            quantityPerCombo: c.cantidad,
            totalRequired: requiredCombos * c.cantidad,
            currentInventory: 0 // TODO: Consultar warehouse si se necesita
          }));
          
          // 9. Agregar al mapa
          comboMap.set(combo.combo, {
            comboName: combo.combo,
            cycleTime,
            components: componentsWithInventory,
            suggestedCombos: requiredCombos,
            totalTime: requiredCombos * cycleTime
          });
          
          console.log(`✅ [COMBO CONFIG] Combo ${combo.combo}: ${requiredCombos} combos sugeridos (${cycleTime.toFixed(2)} min/combo)`);
        }
      }
      
      const comboArray = Array.from(comboMap.values());
      setCombos(comboArray);
      onComboConfigComplete(comboArray);
      
      console.log(`✅ [COMBO CONFIG] ${comboArray.length} combos únicos identificados`);
      
      if (comboArray.length > 0) {
        toast.success("Combos calculados", {
          description: `Se identificaron ${comboArray.length} combo(s) necesarios`,
        });
      }
      
    } catch (err) {
      console.error('Error calculando combos:', err);
      setError(err instanceof Error ? err.message : 'Error desconocido');
      toast.error("Error", {
        description: "No se pudieron calcular los combos necesarios",
      });
    }
    
    setLoading(false);
  };

  const handleComboChange = (comboName: string, newValue: number) => {
    setCombos(prev => prev.map(combo => {
      if (combo.comboName === comboName) {
        return {
          ...combo,
          suggestedCombos: newValue,
          totalTime: newValue * combo.cycleTime,
          components: combo.components.map(c => ({
            ...c,
            totalRequired: newValue * c.quantityPerCombo
          }))
        };
      }
      return combo;
    }));
  };

  const formatTime = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const totalTime = combos.reduce((sum, combo) => sum + combo.totalTime, 0);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <div className="text-center space-y-4">
            <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
            <p className="text-muted-foreground">Calculando combos necesarios...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <div className="text-center space-y-4">
            <AlertCircle className="h-12 w-12 mx-auto text-destructive" />
            <p className="text-destructive font-medium">{error}</p>
            <Button onClick={calculateComboSuggestions}>Reintentar</Button>
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
            <Boxes className="h-6 w-6" />
            Configuración de Combos - Punzonado
          </CardTitle>
          <CardDescription>
            {combos.length === 0 
              ? "No se detectaron referencias que requieran combos en este pedido"
              : "Estos combos se sugieren basados en las referencias requeridas. Puede ajustar las cantidades según necesidad."}
          </CardDescription>
        </CardHeader>
        {combos.length > 0 && (
          <CardContent>
            <div className="mb-4 p-4 bg-muted rounded-lg">
              <div className="text-sm font-medium">Resumen Total</div>
              <div className="text-2xl font-bold text-primary">{formatTime(totalTime)}</div>
              <div className="text-xs text-muted-foreground">{combos.length} combo(s) diferentes</div>
            </div>
          </CardContent>
        )}
      </Card>

      {combos.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Boxes className="h-16 w-16 mx-auto mb-4 opacity-50" />
            <p>No hay combos necesarios para este pedido.</p>
            <p className="text-sm mt-2">Puede continuar al siguiente paso.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {combos.map((combo) => (
            <Card key={combo.comboName}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <CardTitle className="text-lg">{combo.comboName}</CardTitle>
                    <div className="flex gap-2">
                      <Badge variant="secondary">
                        {combo.cycleTime.toFixed(2)} min/combo
                      </Badge>
                      <Badge variant="outline">
                        {combo.components.length} componentes
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Input para cantidad de combos */}
                <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
                  <div className="flex-1">
                    <Label htmlFor={`combo-${combo.comboName}`} className="text-sm font-medium">
                      Cantidad de Combos a Realizar
                    </Label>
                    <Input
                      id={`combo-${combo.comboName}`}
                      type="number"
                      min="0"
                      value={combo.suggestedCombos}
                      onChange={(e) => handleComboChange(combo.comboName, parseInt(e.target.value) || 0)}
                      className="mt-1"
                    />
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-muted-foreground">Tiempo Total</div>
                    <div className="text-lg font-bold text-primary">{formatTime(combo.totalTime)}</div>
                  </div>
                </div>

                {/* Tabla de componentes */}
                <div>
                  <Label className="text-sm font-medium mb-2 block">Componentes del Combo</Label>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Referencia</TableHead>
                        <TableHead className="text-right">Unidades/Combo</TableHead>
                        <TableHead className="text-right">Total Producido</TableHead>
                        <TableHead className="text-right">Requerido</TableHead>
                        <TableHead>Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {combo.components.map(comp => {
                        const totalProduced = comp.quantityPerCombo * combo.suggestedCombos;
                        const isSufficient = totalProduced >= comp.totalRequired;
                        
                        return (
                          <TableRow key={comp.componentId}>
                            <TableCell className="font-medium">{comp.componentId}</TableCell>
                            <TableCell className="text-right">{comp.quantityPerCombo}</TableCell>
                            <TableCell className="text-right font-semibold">{totalProduced}</TableCell>
                            <TableCell className="text-right">{comp.totalRequired}</TableCell>
                            <TableCell>
                              {isSufficient ? (
                                <Badge variant="default" className="bg-green-600">
                                  ✓ Suficiente
                                </Badge>
                              ) : (
                                <Badge variant="destructive">
                                  ✗ Insuficiente
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Botones de navegación */}
      <div className="flex gap-2">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Volver
        </Button>
        <Button onClick={onNext} className="flex-1">
          Continuar a Configurar Operarios
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </div>
  );
};
