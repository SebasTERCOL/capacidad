import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Boxes, ArrowLeft, ArrowRight, Loader2, AlertCircle, Settings } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AdjustedProductionData } from "./InventoryAdjustment";
import { toast } from "@/components/ui/sonner";

export interface ComboOption {
  comboName: string;
  cycleTime: number;
  quantityProducedPerCombo: number;
  allComponents: {
    componentId: string;
    quantityPerCombo: number;
  }[];
}

export interface ReferenceCMB {
  referenceId: string;
  totalRequired: number;
  availableCombos: ComboOption[];
  selectedCombo: string;
  quantityToProduce: number;
}

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

interface ComboManagementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ComboManagementDialog: React.FC<ComboManagementDialogProps> = ({ open, onOpenChange }) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gestión de Combos</DialogTitle>
          <DialogDescription>
            Administra los combos existentes y crea nuevos combos de producción
          </DialogDescription>
        </DialogHeader>
        <div className="p-4 text-center text-muted-foreground">
          <p>Funcionalidad de gestión de combos - En desarrollo</p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export const ComboConfiguration: React.FC<ComboConfigurationProps> = ({
  data,
  onNext,
  onBack,
  onComboConfigComplete
}) => {
  const [references, setReferences] = useState<ReferenceCMB[]>([]);
  const [combos, setCombos] = useState<ComboSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState<string>('');
  const [showComboManagement, setShowComboManagement] = useState(false);

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
      
      const referenceMap = new Map<string, ReferenceCMB>();
      const comboDetailsMap = new Map<string, ComboOption>();
      
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
        
        const availableCombos: ComboOption[] = [];
        
        for (const combo of comboData as any[]) {
          const comboName = combo.combo;
          
          // Si ya procesamos este combo, solo agregarlo a la lista
          if (comboDetailsMap.has(comboName)) {
            const existingCombo = comboDetailsMap.get(comboName)!;
            availableCombos.push(existingCombo);
            continue;
          }
          
          // Obtener tiempo del combo
          const { data: timeData, error: timeError } = await supabase
            .from('machines_processes')
            .select('sam, ref')
            .eq('ref', comboName)
            .eq('id_process', 20)
            .limit(1)
            .maybeSingle();
          
          if (timeError) {
            console.warn(`⚠️ [COMBO CONFIG] Error buscando tiempo para combo ${comboName}:`, timeError);
          }
          
          const cycleTime = timeData?.sam || 0;
          
          // Obtener TODOS los componentes de este combo
          const { data: allComponents, error: allCompError } = await supabase
            .from('combo' as any)
            .select('*')
            .eq('combo', comboName);
          
          if (allCompError || !allComponents) {
            console.error(`❌ Error obteniendo componentes del combo ${comboName}:`, allCompError);
            continue;
          }
          
          const comboOption: ComboOption = {
            comboName,
            cycleTime,
            quantityProducedPerCombo: combo.cantidad,
            allComponents: (allComponents as any[]).map(c => ({
              componentId: c.component_id,
              quantityPerCombo: c.cantidad
            }))
          };
          
          comboDetailsMap.set(comboName, comboOption);
          availableCombos.push(comboOption);
        }
        
        // Identificar el combo principal (el que tiene nombre similar a la referencia)
        const mainCombo = availableCombos.find(c => 
          c.comboName.includes(ref.ref.replace('-CMB', ''))
        ) || availableCombos[0];
        
        const suggestedQuantity = mainCombo 
          ? Math.ceil(ref.quantity / mainCombo.quantityProducedPerCombo)
          : 0;
        
        referenceMap.set(ref.ref, {
          referenceId: ref.ref,
          totalRequired: ref.quantity,
          availableCombos,
          selectedCombo: mainCombo?.comboName || '',
          quantityToProduce: suggestedQuantity
        });
        
        console.log(`✅ [COMBO CONFIG] Referencia ${ref.ref}: ${availableCombos.length} combos disponibles`);
        
        setProgress(55 + ((idx + 1) / totalCmbRefs) * 35); // 55% a 90%
      }
      
      setProgress(95);
      setCurrentStep('Finalizando cálculo de combos...');
      
      const referenceArray = Array.from(referenceMap.values());
      setReferences(referenceArray);
      
      // Convertir a formato ComboSuggestion para mantener compatibilidad
      const comboArray: ComboSuggestion[] = [];
      referenceArray.forEach(refCMB => {
        const selectedComboOption = refCMB.availableCombos.find(c => c.comboName === refCMB.selectedCombo);
        if (selectedComboOption) {
          comboArray.push({
            comboName: refCMB.selectedCombo,
            cycleTime: selectedComboOption.cycleTime,
            components: selectedComboOption.allComponents.map(c => ({
              componentId: c.componentId,
              quantityPerCombo: c.quantityPerCombo,
              totalRequired: allRequiredComponents.get(c.componentId.trim().toUpperCase()) || 0,
              currentInventory: 0
            })),
            suggestedCombos: refCMB.quantityToProduce,
            totalTime: refCMB.quantityToProduce * selectedComboOption.cycleTime
          });
        }
      });
      
      setCombos(comboArray);
      onComboConfigComplete(comboArray);
      
      console.log(`✅ [COMBO CONFIG] ${referenceArray.length} referencias -CMB identificadas`);
      
      if (referenceArray.length > 0) {
        toast.success("Combos calculados", {
          description: `Se identificaron ${referenceArray.length} referencia(s) -CMB`,
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

  const handleReferenceComboChange = (referenceId: string, newComboName: string) => {
    setReferences(prev => prev.map(ref => {
      if (ref.referenceId === referenceId) {
        const newCombo = ref.availableCombos.find(c => c.comboName === newComboName);
        if (newCombo) {
          const suggestedQty = Math.ceil(ref.totalRequired / newCombo.quantityProducedPerCombo);
          return {
            ...ref,
            selectedCombo: newComboName,
            quantityToProduce: suggestedQty
          };
        }
      }
      return ref;
    }));
  };

  const handleReferenceQuantityChange = (referenceId: string, newQuantity: number) => {
    setReferences(prev => prev.map(ref => {
      if (ref.referenceId === referenceId) {
        return {
          ...ref,
          quantityToProduce: newQuantity
        };
      }
      return ref;
    }));
  };

  // Calcular la cantidad producida de una referencia por todos los combos anteriores
  const getProducedByPreviousReferences = (currentReferenceId: string): number => {
    let produced = 0;
    const currentIndex = references.findIndex(r => r.referenceId === currentReferenceId);
    
    // Recorrer todas las referencias anteriores
    for (let i = 0; i < currentIndex; i++) {
      const prevRef = references[i];
      const selectedCombo = prevRef.availableCombos.find(c => c.comboName === prevRef.selectedCombo);
      
      if (selectedCombo) {
        // Buscar si este combo produce la referencia actual
        const producesCurrentRef = selectedCombo.allComponents.find(
          comp => comp.componentId === currentReferenceId
        );
        
        if (producesCurrentRef) {
          produced += producesCurrentRef.quantityPerCombo * prevRef.quantityToProduce;
        }
      }
    }
    
    return produced;
  };

  const formatTime = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const totalTime = references.reduce((sum, ref) => {
    const selectedCombo = ref.availableCombos.find(c => c.comboName === ref.selectedCombo);
    return sum + (selectedCombo ? selectedCombo.cycleTime * ref.quantityToProduce : 0);
  }, 0);

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
    <TooltipProvider>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Boxes className="h-6 w-6" />
                  Configuración de Combos - Punzonado
                </CardTitle>
                <CardDescription>
                  {references.length === 0 
                    ? "No se detectaron referencias que requieran combos en este pedido"
                    : "Configure los combos necesarios para producir las referencias -CMB requeridas"}
                </CardDescription>
              </div>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setShowComboManagement(true)}
              >
                <Settings className="h-4 w-4 mr-2" />
                COMBOS
              </Button>
            </div>
          </CardHeader>
          {references.length > 0 && (
            <CardContent>
              <div className="mb-4 p-4 bg-muted rounded-lg">
                <div className="text-sm font-medium">Resumen Total</div>
                <div className="text-2xl font-bold text-primary">{formatTime(totalTime)}</div>
                <div className="text-xs text-muted-foreground">{references.length} referencia(s) -CMB</div>
              </div>
            </CardContent>
          )}
        </Card>

        {references.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Boxes className="h-16 w-16 mx-auto mb-4 opacity-50" />
              <p>No hay combos necesarios para este pedido.</p>
              <p className="text-sm mt-2">Puede continuar al siguiente paso.</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Referencia</TableHead>
                    <TableHead className="text-right">Requerido</TableHead>
                    <TableHead>Combos</TableHead>
                    <TableHead className="text-center">Cantidad de Combos</TableHead>
                    <TableHead className="text-right">Total Producido</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {references.map((ref) => {
                    const selectedComboOption = ref.availableCombos.find(
                      c => c.comboName === ref.selectedCombo
                    );
                    
                    const previouslyProduced = getProducedByPreviousReferences(ref.referenceId);
                    const adjustedRequired = Math.max(0, ref.totalRequired - previouslyProduced);
                    const totalProduced = selectedComboOption 
                      ? selectedComboOption.quantityProducedPerCombo * ref.quantityToProduce 
                      : 0;
                    const isSufficient = totalProduced >= adjustedRequired;

                    return (
                      <TableRow key={ref.referenceId}>
                        <TableCell className="font-medium">{ref.referenceId}</TableCell>
                        <TableCell className="text-right">{adjustedRequired}</TableCell>
                        <TableCell>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div>
                                <Select
                                  value={ref.selectedCombo}
                                  onValueChange={(value) => handleReferenceComboChange(ref.referenceId, value)}
                                >
                                  <SelectTrigger className="w-[200px]">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {ref.availableCombos.map((combo) => (
                                      <SelectItem key={combo.comboName} value={combo.comboName}>
                                        {combo.comboName}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </TooltipTrigger>
                            {selectedComboOption && (
                              <TooltipContent side="right" className="max-w-sm">
                                <div className="space-y-2">
                                  <div className="font-semibold">{selectedComboOption.comboName}</div>
                                  <div className="text-xs text-muted-foreground">
                                    Tiempo: {selectedComboOption.cycleTime.toFixed(2)} min/combo
                                  </div>
                                  <div className="text-xs">
                                    <div className="font-medium mb-1">Componentes:</div>
                                    {selectedComboOption.allComponents.map((comp) => (
                                      <div key={comp.componentId} className="flex justify-between gap-4">
                                        <span>{comp.componentId}</span>
                                        <span className="text-muted-foreground">
                                          {comp.quantityPerCombo} unidades
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </TooltipContent>
                            )}
                          </Tooltip>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="0"
                            value={ref.quantityToProduce}
                            onChange={(e) => handleReferenceQuantityChange(
                              ref.referenceId, 
                              parseInt(e.target.value) || 0
                            )}
                            className="w-24 text-center"
                          />
                        </TableCell>
                        <TableCell className="text-right font-semibold">{totalProduced}</TableCell>
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
            </CardContent>
          </Card>
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

        <ComboManagementDialog 
          open={showComboManagement} 
          onOpenChange={setShowComboManagement}
        />
      </div>
    </TooltipProvider>
  );
};
