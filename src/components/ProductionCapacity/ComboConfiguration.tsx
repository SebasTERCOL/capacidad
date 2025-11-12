import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
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
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState<string>('');

  useEffect(() => {
    calculateComboSuggestions();
  }, [data]);

  // Cache global para evitar consultas repetidas
  const bomCache = new Map<string, Array<{component_id: string, amount: number}>>();
  
  // Función optimizada para obtener BOM con caché
  const getBOMData = async (productId: string): Promise<Array<{component_id: string, amount: number}>> => {
    const key = productId.trim().toUpperCase();
    
    if (bomCache.has(key)) {
      return bomCache.get(key)!;
    }
    
    const { data: bomData, error: bomError } = await supabase
      .from('bom')
      .select('component_id, amount')
      .eq('product_id', key);
    
    if (bomError) {
      console.error(`❌ Error al buscar BOM para ${productId}:`, bomError);
      bomCache.set(key, []);
      return [];
    }
    
    const result = bomData || [];
    bomCache.set(key, result);
    return result;
  };

  // Función recursiva optimizada para obtener todos los componentes del BOM
  const getRecursiveBOM = async (
    productId: string, 
    quantity: number = 1, 
    level: number = 0, 
    globalVisited: Set<string>,
    componentsMap: Map<string, number>
  ): Promise<void> => {
    const key = productId.trim().toUpperCase();
    
      // Prevenir loops infinitos
    if (level > 10) {
      console.warn(`🔄 Nivel máximo alcanzado para ${key}`);
      return;
    }
    
    // Buscar BOM con caché
    const bomData = await getBOMData(key);
    
    if (bomData.length === 0) {
      return;
    }
    
    // Procesar todos los componentes
    for (const bomItem of bomData) {
      const componentId = bomItem.component_id.trim().toUpperCase();
      const componentQuantity = quantity * bomItem.amount;
      
      // Agregar o actualizar la cantidad en el mapa
      const existingQuantity = componentsMap.get(componentId) || 0;
      componentsMap.set(componentId, existingQuantity + componentQuantity);
      
      // Hacer recursión siempre para acumular cantidades correctamente
      // pero solo si el componente tiene BOM
      await getRecursiveBOM(componentId, componentQuantity, level + 1, globalVisited, componentsMap);
    }
  };

  const calculateComboSuggestions = async () => {
    setLoading(true);
    setError(null);
    setProgress(0);
    
    try {
      console.log('🔧 [COMBO CONFIG] Iniciando cálculo de combos...');
      console.log(`📋 [COMBO CONFIG] Procesando ${data.length} referencias del pedido`);
      
      // 1. Hacer desglose BOM completo de todas las referencias del pedido
      setProgress(10);
      setCurrentStep('Analizando desglose BOM de referencias...');
      
      const allRequiredComponents = new Map<string, number>();
      const globalVisited = new Set<string>();
      
      const totalRefs = data.length;
      for (let i = 0; i < data.length; i++) {
        const item = data[i];
        setCurrentStep(`Analizando ${item.referencia} (${i + 1}/${totalRefs})`);
        console.log(`\n🎯 [COMBO CONFIG] Analizando ${item.referencia} (cantidad: ${item.cantidad})`);
        await getRecursiveBOM(item.referencia, item.cantidad, 0, globalVisited, allRequiredComponents);
        setProgress(10 + (i + 1) / totalRefs * 30); // 10% a 40%
      }
      
      console.log(`\n📊 [COMBO CONFIG] Total de componentes únicos encontrados: ${allRequiredComponents.size}`);
      
      // 2. Filtrar solo las referencias que terminan en -CMB
      setProgress(45);
      setCurrentStep('Identificando referencias -CMB...');
      
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
        setProgress(100);
        return;
      }
      
      setProgress(55);
      setCurrentStep(`Procesando ${cmbReferences.length} referencias -CMB...`);
      
      const comboMap = new Map<string, ComboSuggestion>();
      
      // 3. Para cada referencia -CMB, buscar en qué combos está
      const totalCmbRefs = cmbReferences.length;
      for (let idx = 0; idx < cmbReferences.length; idx++) {
        const ref = cmbReferences[idx];
        setCurrentStep(`Consultando combos para ${ref.ref} (${idx + 1}/${totalCmbRefs})`);
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
            
            // No recalcular totalRequired, mantenerlo fijo del pedido original
            
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
          
          // 8. Obtener requerimiento real de cada componente del pedido original
          const componentsWithInventory = (allComponents as any[]).map(c => ({
            componentId: c.component_id,
            quantityPerCombo: c.cantidad,
            totalRequired: allRequiredComponents.get(c.component_id.trim().toUpperCase()) || 0,
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
        
        setProgress(55 + ((idx + 1) / totalCmbRefs) * 35); // 55% a 90%
      }
      
      setProgress(95);
      setCurrentStep('Finalizando cálculo de combos...');
      
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
    setProgress(100);
  };

  const handleComboChange = (comboName: string, newValue: number) => {
    setCombos(prev => prev.map(combo => {
      if (combo.comboName === comboName) {
        return {
          ...combo,
          suggestedCombos: newValue,
          totalTime: newValue * combo.cycleTime,
        };
      }
      return combo;
    }));
  };

  // Calcular componentes producidos acumulados hasta un combo específico
  const getAccumulatedProduction = (upToComboIndex: number): Map<string, number> => {
    const accumulated = new Map<string, number>();
    
    for (let i = 0; i < upToComboIndex; i++) {
      const combo = combos[i];
      combo.components.forEach(comp => {
        const produced = comp.quantityPerCombo * combo.suggestedCombos;
        const existing = accumulated.get(comp.componentId) || 0;
        accumulated.set(comp.componentId, existing + produced);
      });
    }
    
    return accumulated;
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
        <CardContent className="p-8">
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-3">
              <div className="animate-spin h-8 w-8 border-b-2 border-primary"></div>
              <div className="text-center">
                <p className="font-medium">Calculando combos necesarios...</p>
                {currentStep && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {currentStep}
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
                        // Obtener índice del combo actual
                        const currentComboIndex = combos.findIndex(c => c.comboName === combo.comboName);
                        
                        // Calcular producción acumulada de combos anteriores
                        const accumulated = getAccumulatedProduction(currentComboIndex);
                        const previouslyProduced = accumulated.get(comp.componentId) || 0;
                        
                        // Calcular producción de este combo
                        const totalProduced = comp.quantityPerCombo * combo.suggestedCombos;
                        
                        // Calcular requerido ajustado (restando lo ya producido)
                        const adjustedRequired = Math.max(0, comp.totalRequired - previouslyProduced);
                        
                        // Verificar si es suficiente comparando con el requerido ajustado
                        const isSufficient = totalProduced >= adjustedRequired;
                        
                        return (
                          <TableRow key={comp.componentId}>
                            <TableCell className="font-medium">{comp.componentId}</TableCell>
                            <TableCell className="text-right">{comp.quantityPerCombo}</TableCell>
                            <TableCell className="text-right font-semibold">{totalProduced}</TableCell>
                            <TableCell className="text-right">{adjustedRequired}</TableCell>
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
