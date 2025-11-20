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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Boxes, ArrowLeft, ArrowRight, Loader2, AlertCircle, Settings, Plus, Trash2, Edit2, Save, X, ChevronDown, ChevronRight, Minimize2, Info, Activity, List, Package, Upload, CheckCircle2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { AdjustedProductionData } from "./InventoryAdjustment";
import { toast } from "@/components/ui/sonner";
import { ComboViewByCombo } from "./ComboViewByCombo";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ComboComparisonDialog } from "./ComboComparisonDialog";

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

interface ComboData {
  comboName: string;
  components: {
    componentId: string;
    quantity: number;
  }[];
  cycleTime: number;
}

const ComboManagementDialog: React.FC<ComboManagementDialogProps> = ({ open, onOpenChange }) => {
  const [combos, setCombos] = useState<ComboData[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingCombo, setEditingCombo] = useState<string | null>(null);
  const [editedData, setEditedData] = useState<ComboData | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newCombo, setNewCombo] = useState<ComboData>({
    comboName: '',
    components: [{ componentId: '', quantity: 1 }],
    cycleTime: 0
  });

  useEffect(() => {
    if (open) {
      loadCombos();
    }
  }, [open]);

  const loadCombos = async () => {
    setLoading(true);
    try {
      // Cargar todos los combos de la tabla combo
      const { data: comboData, error: comboError } = await (supabase as any)
        .from('combo')
        .select('*')
        .order('combo');

      if (comboError) throw comboError;

      // Agrupar por nombre de combo
      const groupedCombos = new Map<string, ComboData>();
      
      comboData?.forEach((row: any) => {
        const comboName = row.combo;
        if (!groupedCombos.has(comboName)) {
          groupedCombos.set(comboName, {
            comboName,
            components: [],
            cycleTime: 0
          });
        }
        groupedCombos.get(comboName)!.components.push({
          componentId: row.component_id,
          quantity: row.cantidad || 1
        });
      });

      // Obtener tiempos de machines_processes
      const comboNames = Array.from(groupedCombos.keys());
      if (comboNames.length > 0) {
        const { data: machineData, error: machineError } = await supabase
          .from('machines_processes')
          .select('ref, sam')
          .in('ref', comboNames);

        if (machineError) throw machineError;

        machineData?.forEach((row: any) => {
          if (groupedCombos.has(row.ref)) {
            groupedCombos.get(row.ref)!.cycleTime = row.sam;
          }
        });
      }

      setCombos(Array.from(groupedCombos.values()));
    } catch (error) {
      console.error('Error loading combos:', error);
      toast.error('Error al cargar los combos');
    } finally {
      setLoading(false);
    }
  };

  const handleStartEdit = (combo: ComboData) => {
    setEditingCombo(combo.comboName);
    setEditedData({ ...combo, components: [...combo.components] });
  };

  const handleCancelEdit = () => {
    setEditingCombo(null);
    setEditedData(null);
  };

  const handleSaveEdit = async () => {
    if (!editedData) return;

    setLoading(true);
    try {
      // Eliminar registros antiguos del combo
      const { error: deleteError } = await (supabase as any)
        .from('combo')
        .delete()
        .eq('combo', editingCombo);

      if (deleteError) throw deleteError;

      // Insertar nuevos registros
      const insertData = editedData.components.map(comp => ({
        combo: editedData.comboName,
        component_id: comp.componentId,
        cantidad: comp.quantity
      }));

      const { error: insertError } = await (supabase as any)
        .from('combo')
        .insert(insertData);

      if (insertError) throw insertError;

      // Actualizar tiempo en machines_processes
      const { error: updateError } = await supabase
        .from('machines_processes')
        .update({ sam: editedData.cycleTime })
        .eq('ref', editedData.comboName);

      if (updateError) throw updateError;

      toast.success('Combo actualizado exitosamente');
      setEditingCombo(null);
      setEditedData(null);
      loadCombos();
    } catch (error) {
      console.error('Error saving combo:', error);
      toast.error('Error al guardar el combo');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCombo = async (comboName: string) => {
    if (!confirm(`¿Estás seguro de eliminar el combo ${comboName}?`)) return;

    setLoading(true);
    try {
      const { error } = await (supabase as any)
        .from('combo')
        .delete()
        .eq('combo', comboName);

      if (error) throw error;

      toast.success('Combo eliminado exitosamente');
      loadCombos();
    } catch (error) {
      console.error('Error deleting combo:', error);
      toast.error('Error al eliminar el combo');
    } finally {
      setLoading(false);
    }
  };

  const handleAddComponent = (isNew: boolean) => {
    if (isNew) {
      setNewCombo({
        ...newCombo,
        components: [...newCombo.components, { componentId: '', quantity: 1 }]
      });
    } else if (editedData) {
      setEditedData({
        ...editedData,
        components: [...editedData.components, { componentId: '', quantity: 1 }]
      });
    }
  };

  const handleRemoveComponent = (index: number, isNew: boolean) => {
    if (isNew) {
      const newComponents = newCombo.components.filter((_, i) => i !== index);
      setNewCombo({ ...newCombo, components: newComponents });
    } else if (editedData) {
      const newComponents = editedData.components.filter((_, i) => i !== index);
      setEditedData({ ...editedData, components: newComponents });
    }
  };

  const handleSaveNewCombo = async () => {
    if (!newCombo.comboName || newCombo.components.some(c => !c.componentId)) {
      toast.error('Completa todos los campos del combo');
      return;
    }

    setLoading(true);
    try {
      // Insertar componentes del combo
      const insertData = newCombo.components.map(comp => ({
        combo: newCombo.comboName,
        component_id: comp.componentId,
        cantidad: comp.quantity
      }));

      const { error: insertError } = await (supabase as any)
        .from('combo')
        .insert(insertData);

      if (insertError) throw insertError;

      // Insertar tiempo en machines_processes (necesitamos id_machine e id_process)
      // Por ahora, usaremos valores por defecto que se pueden editar después
      const { error: machineError } = await supabase
        .from('machines_processes')
        .insert({
          ref: newCombo.comboName,
          sam: newCombo.cycleTime,
          id_machine: 1, // Valor por defecto
          id_process: 20, // Punzonado por defecto
          frequency: 1,
          sam_unit: 'min_per_unit'
        });

      if (machineError) throw machineError;

      toast.success('Combo creado exitosamente');
      setIsAddingNew(false);
      setNewCombo({
        comboName: '',
        components: [{ componentId: '', quantity: 1 }],
        cycleTime: 0
      });
      loadCombos();
    } catch (error) {
      console.error('Error creating combo:', error);
      toast.error('Error al crear el combo');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>Gestión de Combos</DialogTitle>
          <DialogDescription>
            Administra los combos existentes y crea nuevos combos de producción
          </DialogDescription>
        </DialogHeader>
        
        <ScrollArea className="h-[60vh] pr-4">
          {loading && combos.length === 0 ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Botón para agregar nuevo combo */}
              {!isAddingNew && (
                <Button onClick={() => setIsAddingNew(true)} className="w-full">
                  <Plus className="h-4 w-4 mr-2" />
                  Agregar Nuevo Combo
                </Button>
              )}

              {/* Formulario para nuevo combo */}
              {isAddingNew && (
                <Card className="border-2 border-primary">
                  <CardHeader>
                    <CardTitle className="text-lg">Nuevo Combo</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Nombre del Combo</Label>
                        <Input
                          value={newCombo.comboName}
                          onChange={(e) => setNewCombo({ ...newCombo, comboName: e.target.value })}
                          placeholder="Ej: CMB.NOMBRE.V1"
                        />
                      </div>
                      <div>
                        <Label>Tiempo (minutos)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={newCombo.cycleTime}
                          onChange={(e) => setNewCombo({ ...newCombo, cycleTime: parseFloat(e.target.value) || 0 })}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <Label>Componentes</Label>
                        <Button size="sm" variant="outline" onClick={() => handleAddComponent(true)}>
                          <Plus className="h-3 w-3 mr-1" />
                          Agregar
                        </Button>
                      </div>
                      {newCombo.components.map((comp, idx) => (
                        <div key={idx} className="flex gap-2 mb-2">
                          <Input
                            placeholder="Referencia"
                            value={comp.componentId}
                            onChange={(e) => {
                              const newComponents = [...newCombo.components];
                              newComponents[idx].componentId = e.target.value;
                              setNewCombo({ ...newCombo, components: newComponents });
                            }}
                            className="flex-1"
                          />
                          <Input
                            type="number"
                            placeholder="Cantidad"
                            value={comp.quantity}
                            onChange={(e) => {
                              const newComponents = [...newCombo.components];
                              newComponents[idx].quantity = parseFloat(e.target.value) || 1;
                              setNewCombo({ ...newCombo, components: newComponents });
                            }}
                            className="w-24"
                          />
                          {newCombo.components.length > 1 && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleRemoveComponent(idx, true)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="flex gap-2">
                      <Button onClick={handleSaveNewCombo} disabled={loading}>
                        <Save className="h-4 w-4 mr-2" />
                        Guardar
                      </Button>
                      <Button variant="outline" onClick={() => {
                        setIsAddingNew(false);
                        setNewCombo({
                          comboName: '',
                          components: [{ componentId: '', quantity: 1 }],
                          cycleTime: 0
                        });
                      }}>
                        <X className="h-4 w-4 mr-2" />
                        Cancelar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Lista de combos existentes */}
              {combos.map((combo) => (
                <Card key={combo.comboName}>
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-lg">{combo.comboName}</CardTitle>
                        <CardDescription>
                          Tiempo: {combo.cycleTime.toFixed(2)} min/combo
                        </CardDescription>
                      </div>
                      {editingCombo !== combo.comboName && (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleStartEdit(combo)}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDeleteCombo(combo.comboName)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    {editingCombo === combo.comboName && editedData ? (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label>Nombre del Combo</Label>
                            <Input
                              value={editedData.comboName}
                              onChange={(e) => setEditedData({ ...editedData, comboName: e.target.value })}
                            />
                          </div>
                          <div>
                            <Label>Tiempo (minutos)</Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={editedData.cycleTime}
                              onChange={(e) => setEditedData({ ...editedData, cycleTime: parseFloat(e.target.value) || 0 })}
                            />
                          </div>
                        </div>

                        <div>
                          <div className="flex justify-between items-center mb-2">
                            <Label>Componentes</Label>
                            <Button size="sm" variant="outline" onClick={() => handleAddComponent(false)}>
                              <Plus className="h-3 w-3 mr-1" />
                              Agregar
                            </Button>
                          </div>
                          {editedData.components.map((comp, idx) => (
                            <div key={idx} className="flex gap-2 mb-2">
                              <Input
                                placeholder="Referencia"
                                value={comp.componentId}
                                onChange={(e) => {
                                  const newComponents = [...editedData.components];
                                  newComponents[idx].componentId = e.target.value;
                                  setEditedData({ ...editedData, components: newComponents });
                                }}
                                className="flex-1"
                              />
                              <Input
                                type="number"
                                placeholder="Cantidad"
                                value={comp.quantity}
                                onChange={(e) => {
                                  const newComponents = [...editedData.components];
                                  newComponents[idx].quantity = parseFloat(e.target.value) || 1;
                                  setEditedData({ ...editedData, components: newComponents });
                                }}
                                className="w-24"
                              />
                              {editedData.components.length > 1 && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleRemoveComponent(idx, false)}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>

                        <div className="flex gap-2">
                          <Button onClick={handleSaveEdit} disabled={loading}>
                            <Save className="h-4 w-4 mr-2" />
                            Guardar
                          </Button>
                          <Button variant="outline" onClick={handleCancelEdit}>
                            <X className="h-4 w-4 mr-2" />
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Componente</TableHead>
                            <TableHead className="text-right">Cantidad</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {combo.components.map((comp, idx) => (
                            <TableRow key={idx}>
                              <TableCell>{comp.componentId}</TableCell>
                              <TableCell className="text-right">{comp.quantity}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
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
  const [expandedReferences, setExpandedReferences] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'by-reference' | 'by-combo'>('by-reference');
  
  // Estados para carga CSV
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvData, setCsvData] = useState<{ combo: string; cantidad: number }[]>([]);
  const [csvLoading, setCsvLoading] = useState(false);
  const [showComparisonReport, setShowComparisonReport] = useState(false);
  const [comparisonReport, setComparisonReport] = useState<any[]>([]);

  useEffect(() => {
    calculateComboSuggestions();
  }, [data]);

  // Efecto para forzar quantityToProduce a 0 cuando totalRequired es 0
  useEffect(() => {
    setReferences(prev => prev.map(ref => {
      if (ref.totalRequired === 0 && ref.quantityToProduce > 0) {
        return {
          ...ref,
          quantityToProduce: 0
        };
      }
      return ref;
    }));
  }, [references]);

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
      
      // 2. Obtener TODAS las referencias (no solo -CMB)
      setProgress(45);
      setCurrentStep('Identificando todas las referencias necesarias...');
      
      const allReferences: Array<{ ref: string; quantity: number }> = [];
      for (const [componentId, quantity] of allRequiredComponents) {
        allReferences.push({ ref: componentId, quantity });
        console.log(`🎯 [COMBO CONFIG] Referencia encontrada: ${componentId} (cantidad: ${quantity})`);
      }
      
      console.log(`\n📦 [COMBO CONFIG] ${allReferences.length} referencias totales necesarias`);
      
      if (allReferences.length === 0) {
        console.log('✅ [COMBO CONFIG] No hay referencias, saltando configuración');
        setCombos([]);
        setLoading(false);
        setProgress(100);
        return;
      }
      
      // Identificar cuáles son referencias -CMB (estas requieren combos)
      const cmbReferences = allReferences.filter(r => r.ref.endsWith('-CMB'));
      console.log(`📦 [COMBO CONFIG] ${cmbReferences.length} referencias -CMB que requieren combos`);
      
      if (cmbReferences.length === 0) {
        console.log('✅ [COMBO CONFIG] No hay referencias -CMB, saltando configuración de combos');
        // Crear referencias sin combos para mostrar en la UI
        const referencesWithoutCombos: ReferenceCMB[] = allReferences.map(ref => ({
          referenceId: ref.ref,
          totalRequired: ref.quantity,
          availableCombos: [],
          selectedCombo: '',
          quantityToProduce: 0
        }));
        setReferences(referencesWithoutCombos);
        setLoading(false);
        setProgress(100);
        return;
      }
      
      setProgress(55);
      setCurrentStep(`Cargando datos de combos...`);
      
      // OPTIMIZACIÓN: Cargar TODOS los datos de una vez en lugar de consultas individuales
      console.log('🚀 [COMBO CONFIG] Cargando datos masivos de combos...');
      
      // 1. Obtener TODAS las relaciones combo-componente de una vez
      const { data: allComboRelations, error: comboError } = await supabase
        .from('combo' as any)
        .select('*');
      
      if (comboError) {
        throw new Error(`Error cargando combos: ${comboError.message}`);
      }
      
      // 2. Obtener TODOS los tiempos de combos de una vez
      const uniqueComboNames = [...new Set((allComboRelations as any[])?.map(r => r.combo) || [])];
      const { data: allComboTimes, error: timeError } = await supabase
        .from('machines_processes')
        .select('sam, ref')
        .eq('id_process', 20)
        .in('ref', uniqueComboNames);
      
      if (timeError) {
        console.warn('⚠️ Error cargando tiempos de combos:', timeError);
      }
      
      console.log(`✅ Cargados ${allComboRelations?.length || 0} relaciones y ${allComboTimes?.length || 0} tiempos`);
      
      setProgress(65);
      setCurrentStep('Procesando datos en memoria...');
      
      // Crear mapas para acceso rápido
      const comboTimeMap = new Map<string, number>();
      (allComboTimes || []).forEach((t: any) => {
        comboTimeMap.set(t.ref, t.sam || 0);
      });
      
      // Agrupar componentes por combo
      const comboComponentsMap = new Map<string, any[]>();
      (allComboRelations || []).forEach((rel: any) => {
        if (!comboComponentsMap.has(rel.combo)) {
          comboComponentsMap.set(rel.combo, []);
        }
        comboComponentsMap.get(rel.combo)!.push(rel);
      });
      
      // Crear mapa de componente -> combos disponibles
      const componentToCombosMap = new Map<string, string[]>();
      (allComboRelations || []).forEach((rel: any) => {
        const compId = rel.component_id;
        if (!componentToCombosMap.has(compId)) {
          componentToCombosMap.set(compId, []);
        }
        if (!componentToCombosMap.get(compId)!.includes(rel.combo)) {
          componentToCombosMap.get(compId)!.push(rel.combo);
        }
      });
      
      setProgress(75);
      setCurrentStep('Asignando combos a referencias...');
      
      const referenceMap = new Map<string, ReferenceCMB>();
      const comboDetailsMap = new Map<string, ComboOption>();
      
      // 3. Procesar cada referencia en memoria (sin consultas adicionales)
      for (let idx = 0; idx < allReferences.length; idx++) {
        const ref = allReferences[idx];
        
        const combosForComponent = componentToCombosMap.get(ref.ref) || [];
        
        if (combosForComponent.length === 0) {
          console.warn(`⚠️ [COMBO CONFIG] No se encontraron combos para ${ref.ref}`);
          continue;
        }
        
        console.log(`✅ [COMBO CONFIG] ${combosForComponent.length} combo(s) encontrado(s) para ${ref.ref}`);
        
        const availableCombos: ComboOption[] = [];
        
        for (const comboName of combosForComponent) {
          // Si ya procesamos este combo, reutilizarlo
          if (comboDetailsMap.has(comboName)) {
            availableCombos.push(comboDetailsMap.get(comboName)!);
            continue;
          }
          
          const comboComponents = comboComponentsMap.get(comboName) || [];
          const cycleTime = comboTimeMap.get(comboName) || 0;
          
          // Encontrar la cantidad producida por combo para este componente específico
          const thisComponentInCombo = comboComponents.find(c => c.component_id === ref.ref);
          const quantityProducedPerCombo = thisComponentInCombo?.cantidad || 1;
          
          const comboOption: ComboOption = {
            comboName,
            cycleTime,
            quantityProducedPerCombo,
            allComponents: comboComponents.map(c => ({
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
        
        // Si la cantidad requerida es 0, no producir ningún combo
        const suggestedQuantity = ref.quantity === 0 
          ? 0 
          : mainCombo 
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
        
        setProgress(75 + ((idx + 1) / totalRefs) * 20); // 75% a 95%
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
          // Si el requerido es 0, no producir combos
          const suggestedQty = ref.totalRequired === 0 ? 0 : Math.ceil(ref.totalRequired / newCombo.quantityProducedPerCombo);
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

  // Handler para cambios de cantidad en vista por combo
  const handleComboQuantityChange = (comboName: string, newTotalQuantity: number) => {
    setReferences(prev => {
      // Encontrar todas las referencias que usan este combo
      const refsWithCombo = prev.filter(ref => ref.selectedCombo === comboName && ref.quantityToProduce > 0);
      
      if (refsWithCombo.length === 0) return prev;
      
      // Si solo hay una referencia, actualizar directamente
      if (refsWithCombo.length === 1) {
        return prev.map(ref => 
          ref.referenceId === refsWithCombo[0].referenceId
            ? { ...ref, quantityToProduce: newTotalQuantity }
            : ref
        );
      }
      
      // Si hay múltiples referencias, distribuir proporcionalmente
      const totalCurrent = refsWithCombo.reduce((sum, ref) => sum + ref.quantityToProduce, 0);
      
      return prev.map(ref => {
        const refWithCombo = refsWithCombo.find(r => r.referenceId === ref.referenceId);
        if (refWithCombo && totalCurrent > 0) {
          const proportion = refWithCombo.quantityToProduce / totalCurrent;
          return { ...ref, quantityToProduce: Math.round(newTotalQuantity * proportion) };
        }
        return ref;
      });
    });
  };

  // Algoritmo de optimización avanzado con valores actuales como punto de partida
  const optimizeComboProduction = () => {
    console.log('\n🎯 === INICIANDO OPTIMIZACIÓN AVANZADA DE COMBOS ===');
    
    // Paso 1: Usar valores actuales como punto de partida
    const currentState = references.map(ref => ({
      ...ref,
      initialQuantity: ref.quantityToProduce
    }));
    
    console.log('📊 Estado inicial (valores actuales):');
    currentState.forEach(ref => {
      const selectedCombo = ref.availableCombos.find(c => c.comboName === ref.selectedCombo);
      if (selectedCombo && ref.initialQuantity > 0) {
        const produced = ref.initialQuantity * selectedCombo.quantityProducedPerCombo;
        console.log(`   ${ref.referenceId}: ${ref.initialQuantity} combos → ${produced} unidades (req: ${ref.totalRequired})`);
      }
    });
    
    // Paso 2: Calcular la demanda total considerando lo que cada combo produce
    const demandMap = new Map<string, number>();
    const productionMap = new Map<string, number>();
    
    // Inicializar demanda de todas las referencias
    references.forEach(ref => {
      demandMap.set(ref.referenceId, ref.totalRequired);
      productionMap.set(ref.referenceId, 0);
    });
    
    // Calcular producción actual con los valores iniciales
    currentState.forEach(ref => {
      const selectedCombo = ref.availableCombos.find(c => c.comboName === ref.selectedCombo);
      if (selectedCombo && ref.initialQuantity > 0) {
        selectedCombo.allComponents.forEach(comp => {
          const currentProduction = productionMap.get(comp.componentId) || 0;
          productionMap.set(
            comp.componentId,
            currentProduction + (comp.quantityPerCombo * ref.initialQuantity)
          );
        });
      }
    });
    
    console.log('\n📈 Análisis de demanda vs producción actual:');
    demandMap.forEach((demand, refId) => {
      const production = productionMap.get(refId) || 0;
      const diff = production - demand;
      console.log(`   ${refId}: Demanda=${demand}, Producción=${production}, Diff=${diff}`);
    });
    
    // Paso 3: Optimización iterativa para ajustar cantidades
    let optimizedReferences = [...currentState];
    let improved = true;
    let iterations = 0;
    const maxIterations = 100;
    
    while (improved && iterations < maxIterations) {
      improved = false;
      iterations++;
      
      // Recalcular producción actual
      productionMap.clear();
      references.forEach(ref => productionMap.set(ref.referenceId, 0));
      
      optimizedReferences.forEach(ref => {
        const selectedCombo = ref.availableCombos.find(c => c.comboName === ref.selectedCombo);
        if (selectedCombo && ref.quantityToProduce > 0) {
          selectedCombo.allComponents.forEach(comp => {
            const currentProduction = productionMap.get(comp.componentId) || 0;
            productionMap.set(
              comp.componentId,
              currentProduction + (comp.quantityPerCombo * ref.quantityToProduce)
            );
          });
        }
      });
      
      // Buscar referencias con déficit y ajustar
      for (const ref of optimizedReferences) {
        if (ref.totalRequired === 0) {
          if (ref.quantityToProduce > 0) {
            ref.quantityToProduce = 0;
            improved = true;
          }
          continue;
        }
        
        const selectedCombo = ref.availableCombos.find(c => c.comboName === ref.selectedCombo);
        if (!selectedCombo) continue;
        
        const currentProduction = productionMap.get(ref.referenceId) || 0;
        const deficit = ref.totalRequired - currentProduction;
        
        if (deficit > 0) {
          // Hay déficit, necesitamos aumentar combos
          const additionalCombos = Math.ceil(deficit / selectedCombo.quantityProducedPerCombo);
          ref.quantityToProduce += additionalCombos;
          improved = true;
        } else if (deficit < 0 && ref.quantityToProduce > 0) {
          // Hay exceso, intentar reducir sin crear déficit
          const excess = Math.abs(deficit);
          const combosToRemove = Math.floor(excess / selectedCombo.quantityProducedPerCombo);
          
          if (combosToRemove > 0 && combosToRemove < ref.quantityToProduce) {
            ref.quantityToProduce -= combosToRemove;
            improved = true;
          }
        }
      }
    }
    
    console.log(`\n✅ Optimización completada en ${iterations} iteraciones`);
    
    // Paso 4: Verificación final
    productionMap.clear();
    references.forEach(ref => productionMap.set(ref.referenceId, 0));
    
    optimizedReferences.forEach(ref => {
      const selectedCombo = ref.availableCombos.find(c => c.comboName === ref.selectedCombo);
      if (selectedCombo && ref.quantityToProduce > 0) {
        selectedCombo.allComponents.forEach(comp => {
          const currentProduction = productionMap.get(comp.componentId) || 0;
          productionMap.set(
            comp.componentId,
            currentProduction + (comp.quantityPerCombo * ref.quantityToProduce)
          );
        });
      }
    });
    
    console.log('\n📊 Estado final optimizado:');
    let totalTimeOptimized = 0;
    optimizedReferences.forEach(ref => {
      const selectedCombo = ref.availableCombos.find(c => c.comboName === ref.selectedCombo);
      if (selectedCombo && ref.quantityToProduce > 0) {
        const produced = productionMap.get(ref.referenceId) || 0;
        const time = ref.quantityToProduce * selectedCombo.cycleTime;
        totalTimeOptimized += time;
        console.log(`   ${ref.referenceId}: ${ref.quantityToProduce} combos → ${produced} unidades (req: ${ref.totalRequired}, tiempo: ${time.toFixed(2)}min)`);
      }
    });
    
    console.log(`\n⏱️ Tiempo total optimizado: ${(totalTimeOptimized / 60).toFixed(2)} horas`);
    
    // Aplicar la optimización
    setReferences(optimizedReferences.map(({ initialQuantity, ...ref }) => ref));
    
    toast.success("Optimización completada", {
      description: `Tiempo total: ${(totalTimeOptimized / 60).toFixed(2)} horas`,
    });
  };

  // Función para parsear CSV
  const handleCSVUpload = async (file: File) => {
    setCsvLoading(true);
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const lines = text.split('\n').filter(line => line.trim());
        
        if (lines.length === 0) {
          throw new Error('El archivo está vacío');
        }
        
        // Asumir formato: combo,cantidad (primera línea es encabezado)
        const data = lines.slice(1).map(line => {
          const [combo, cantidad] = line.split(',').map(s => s.trim());
          return {
            combo: combo,
            cantidad: parseInt(cantidad) || 0
          };
        }).filter(item => item.combo && item.cantidad > 0);
        
        setCsvData(data);
        setCsvLoading(false);
        
        toast.success("CSV cargado exitosamente", {
          description: `${data.length} combos importados. Presiona 'Calcular' para aplicar.`
        });
      } catch (error) {
        setCsvLoading(false);
        toast.error("Error al procesar el archivo CSV", {
          description: "Verifica que el formato sea correcto: combo,cantidad"
        });
      }
    };
    
    reader.onerror = () => {
      setCsvLoading(false);
      toast.error("Error al leer el archivo CSV");
    };
    
    reader.readAsText(file);
  };

  // Función para calcular con el CSV cargado
  const handleCalculateWithCSV = () => {
    if (csvData.length === 0) {
      toast.error("No hay datos de CSV para calcular");
      return;
    }
    
    applyCSVToReferences(csvData);
    generateComparisonReport();
    
    toast.success("Cálculo completado", {
      description: `Se aplicaron ${csvData.length} combos del archivo CSV`
    });
  };

  // Aplicar datos CSV a referencias
  const applyCSVToReferences = (csvData: { combo: string; cantidad: number }[]) => {
    setReferences(prev => prev.map(ref => {
      // Buscar si hay un combo CSV que coincida con algún combo disponible de esta referencia
      const matchingCombos = ref.availableCombos.filter(combo => 
        csvData.some(c => c.combo === combo.comboName)
      );
      
      if (matchingCombos.length > 0) {
        // Tomar el primer combo coincidente
        const firstMatch = matchingCombos[0];
        const csvEntry = csvData.find(c => c.combo === firstMatch.comboName);
        
        if (csvEntry) {
          return {
            ...ref,
            selectedCombo: firstMatch.comboName,
            quantityToProduce: csvEntry.cantidad
          };
        }
      }
      
      return ref;
    }));
  };

  // Generar reporte de comparación
  const generateComparisonReport = () => {
    const report = references.map(ref => {
      const csvEntry = csvData.find(c => c.combo === ref.selectedCombo);
      const csvQuantity = csvEntry?.cantidad || 0;
      const currentQuantity = ref.quantityToProduce;
      const required = ref.totalRequired;
      
      const selectedComboData = ref.availableCombos.find(c => c.comboName === ref.selectedCombo);
      const csvProduction = csvQuantity * (selectedComboData?.quantityProducedPerCombo || 0);
      const difference = csvProduction - required;
      
      return {
        reference: ref.referenceId,
        required,
        csvQuantity,
        csvProduction,
        currentQuantity,
        difference,
        status: difference >= 0 ? 'Cumple' : 'Insuficiente',
        comboUsed: ref.selectedCombo
      };
    }).filter(r => r.csvQuantity > 0); // Solo mostrar referencias que tenían datos en CSV
    
    setComparisonReport(report);
    setShowComparisonReport(true);
  };

  const handleSetMinimumCombos = (referenceId: string) => {
    setReferences(prev => 
      prev.map(ref => {
        if (ref.referenceId === referenceId) {
          const selectedComboOption = ref.availableCombos.find(c => c.comboName === ref.selectedCombo);
          if (selectedComboOption) {
            const previouslyProduced = getProducedByPreviousReferences(ref.referenceId);
            const adjustedRequired = Math.max(0, ref.totalRequired - previouslyProduced);
            const minCombos = Math.ceil(adjustedRequired / selectedComboOption.quantityProducedPerCombo);
            return { ...ref, quantityToProduce: minCombos };
          }
        }
        return ref;
      })
    );
  };

  const toggleReferenceExpansion = (referenceId: string) => {
    setExpandedReferences(prev => {
      const newSet = new Set(prev);
      if (newSet.has(referenceId)) {
        newSet.delete(referenceId);
      } else {
        newSet.add(referenceId);
      }
      return newSet;
    });
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
              <div className="flex gap-2">
                <Button
                  onClick={optimizeComboProduction}
                  variant="default"
                  className="bg-tercol-red hover:bg-tercol-red/90"
                  size="sm"
                >
                  <Activity className="h-4 w-4 mr-2" />
                  Optimizar
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setShowComboManagement(true)}
                >
                  <Settings className="h-4 w-4 mr-2" />
                  COMBOS
                </Button>
              </div>
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

        {/* Sección de Carga CSV */}
        {references.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Importar Configuración de Combos (CSV)
              </CardTitle>
              <CardDescription>
                Sube un archivo CSV con formato: combo,cantidad para pre-configurar las cantidades
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <Input
                  type="file"
                  accept=".csv"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setCsvFile(file);
                      handleCSVUpload(file);
                    }
                  }}
                  disabled={csvLoading}
                  className="flex-1"
                />
                {csvLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              </div>
              
              {csvData.length > 0 && (
                <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                    <p className="text-sm font-medium text-green-900 dark:text-green-100">
                      CSV cargado: {csvData.length} combos importados
                    </p>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button
                      variant="default"
                      size="sm"
                      onClick={handleCalculateWithCSV}
                      className="bg-tercol-red hover:bg-tercol-red/90"
                    >
                      <Activity className="h-4 w-4 mr-2" />
                      Calcular con archivo CSV
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={generateComparisonReport}
                    >
                      Ver Reporte de Comparación
                    </Button>
                  </div>
                  
                  <p className="text-xs text-green-800 dark:text-green-200">
                    * Presiona "Calcular" para aplicar las cantidades del CSV a los combos y ver los resultados
                  </p>
                </div>
              )}
              
              <div className="text-sm text-muted-foreground">
                <p className="font-medium mb-2">Formato esperado del CSV:</p>
                <pre className="bg-muted p-3 rounded text-xs overflow-x-auto">
combo,cantidad{'\n'}CMB.BN42.V1,10{'\n'}CMB.CNCA30.V1,15{'\n'}CMB.PERNO.V1,20
                </pre>
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'by-reference' | 'by-combo')} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="by-reference" className="flex items-center gap-2">
              <List className="h-4 w-4" />
              Por Referencia
            </TabsTrigger>
            <TabsTrigger value="by-combo" className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              Por Combo
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="by-reference" className="mt-4">
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
              <div className="space-y-2">
                  {references.map((ref) => {
                    const selectedComboOption = ref.availableCombos.find(
                      c => c.comboName === ref.selectedCombo
                    );
                    
                    const previouslyProduced = getProducedByPreviousReferences(ref.referenceId);
                    const adjustedRequired = Math.max(0, ref.totalRequired - previouslyProduced);
                    
                    // Calcular qué combos producen esta referencia
                    const producingCombos: { comboName: string; quantity: number }[] = [];
                    references.forEach(otherRef => {
                      const otherSelectedCombo = otherRef.availableCombos.find(
                        c => c.comboName === otherRef.selectedCombo
                      );
                      if (otherSelectedCombo) {
                        const componentInCombo = otherSelectedCombo.allComponents.find(
                          comp => comp.componentId === ref.referenceId
                        );
                        if (componentInCombo && otherRef.quantityToProduce > 0) {
                          const producedQuantity = componentInCombo.quantityPerCombo * otherRef.quantityToProduce;
                          producingCombos.push({
                            comboName: otherSelectedCombo.comboName,
                            quantity: producedQuantity
                          });
                        }
                      }
                    });
                    
                    const totalProduced = producingCombos.reduce((sum, pc) => sum + pc.quantity, 0);
                    const difference = totalProduced - adjustedRequired;
                    const isSufficient = totalProduced >= adjustedRequired;
                    const timeConsumed = selectedComboOption && ref.quantityToProduce > 0
                      ? selectedComboOption.cycleTime * ref.quantityToProduce
                      : 0;

                    const isExpanded = expandedReferences.has(ref.referenceId);

                    return (
                      <Collapsible key={ref.referenceId} open={isExpanded} onOpenChange={() => toggleReferenceExpansion(ref.referenceId)}>
                        <Card className="border-l-4" style={{ borderLeftColor: isSufficient ? 'hsl(var(--tercol-red))' : 'hsl(var(--destructive))' }}>
                          <CardHeader className="py-3 cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => toggleReferenceExpansion(ref.referenceId)}>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <CollapsibleTrigger asChild>
                                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                  </Button>
                                </CollapsibleTrigger>
                                <div>
                                  <div className="font-semibold text-lg">{ref.referenceId}</div>
                                  <div className="text-xs text-muted-foreground">
                                    Requerido: <span className="font-medium">{adjustedRequired}</span> | 
                                    Producido: <span className="font-medium">{totalProduced}</span> | 
                                    Diferencia: <span className={difference > 0 ? 'text-green-600 font-medium' : difference < 0 ? 'text-red-600 font-medium' : 'font-medium'}>
                                      {difference > 0 ? '+' : ''}{difference}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <Badge variant={isSufficient ? "default" : "destructive"}>
                                  {isSufficient ? "Suficiente" : "Insuficiente"}
                                </Badge>
                                <div className="text-right">
                                  <div className="text-sm font-medium">{formatTime(timeConsumed)}</div>
                                  <div className="text-xs text-muted-foreground">{ref.quantityToProduce} combos</div>
                                </div>
                              </div>
                            </div>
                          </CardHeader>
                          <CollapsibleContent>
                            <CardContent className="pt-0 pb-4">
                              <div className="grid grid-cols-3 gap-4 mt-4">
                                <div className="space-y-2">
                                  <Label className="text-xs text-muted-foreground">Combo Seleccionado</Label>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div>
                                        <Select
                                          value={ref.selectedCombo}
                                          onValueChange={(value) => handleReferenceComboChange(ref.referenceId, value)}
                                        >
                                          <SelectTrigger>
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
                                          <div className="font-semibold border-b pb-1">Contenido del Combo</div>
                                          {selectedComboOption.allComponents.map((comp, idx) => (
                                            <div key={idx} className="flex justify-between text-xs">
                                              <span>{comp.componentId}</span>
                                              <span className="font-medium ml-4">x{comp.quantityPerCombo}</span>
                                            </div>
                                          ))}
                                          <div className="border-t pt-1 mt-2">
                                            <span className="text-xs font-semibold">Tiempo: {selectedComboOption.cycleTime.toFixed(2)} min</span>
                                          </div>
                                        </div>
                                      </TooltipContent>
                                    )}
                                  </Tooltip>
                                </div>
                                <div className="space-y-2">
                                  <Label className="text-xs text-muted-foreground">Cantidad de Combos</Label>
                                  <div className="flex items-center gap-2">
                                    <Input
                                      type="number"
                                      min="0"
                                      value={ref.quantityToProduce}
                                      onChange={(e) => handleReferenceQuantityChange(ref.referenceId, parseInt(e.target.value) || 0)}
                                      className="text-center"
                                    />
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button 
                                          variant="outline" 
                                          size="icon"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleSetMinimumCombos(ref.referenceId);
                                          }}
                                        >
                                          <Minimize2 className="h-4 w-4" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p className="text-xs">Calcular mínimo necesario</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </div>
                                </div>
                                <div className="space-y-2">
                                  <Label className="text-xs text-muted-foreground">Información</Label>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button variant="outline" className="w-full justify-start">
                                        <Info className="h-4 w-4 mr-2" />
                                        Ver detalles
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side="left" className="max-w-xs">
                                      <div className="space-y-1 text-xs">
                                        <div className="font-semibold border-b pb-1 mb-1">Combos que producen {ref.referenceId}:</div>
                                        {producingCombos.length > 0 ? (
                                          producingCombos.map((pc, idx) => (
                                            <div key={idx} className="flex justify-between">
                                              <span>{pc.comboName}</span>
                                              <span className="font-medium ml-2">{pc.quantity} unidades</span>
                                            </div>
                                          ))
                                        ) : (
                                          <span className="text-muted-foreground">No producido por combos</span>
                                        )}
                                      </div>
                                    </TooltipContent>
                                  </Tooltip>
                                </div>
                              </div>
                            </CardContent>
                          </CollapsibleContent>
                        </Card>
                      </Collapsible>
                    );
                  })}
              </div>
            </CardContent>
          </Card>
        )}
          </TabsContent>
          
          <TabsContent value="by-combo" className="mt-4">
            <ComboViewByCombo 
              references={references}
              onQuantityChange={handleComboQuantityChange}
            />
          </TabsContent>
        </Tabs>

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
        
        <ComboComparisonDialog
          open={showComparisonReport}
          onOpenChange={setShowComparisonReport}
          report={comparisonReport}
        />
      </div>
    </TooltipProvider>
  );
};
