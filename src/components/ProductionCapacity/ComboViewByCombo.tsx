import React from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Boxes } from "lucide-react";
import { ReferenceCMB } from "./ComboConfiguration";

interface ComboViewByComboProps {
  references: ReferenceCMB[];
  onQuantityChange: (comboName: string, newQuantity: number) => void;
}

interface ComboGrouped {
  comboName: string;
  cycleTime: number;
  totalQuantity: number;
  references: {
    referenceId: string;
    quantity: number;
  }[];
}

export const ComboViewByCombo: React.FC<ComboViewByComboProps> = ({
  references,
  onQuantityChange,
}) => {
  // Agrupar referencias por combo
  const combosGrouped = React.useMemo(() => {
    const comboMap = new Map<string, ComboGrouped>();

    references.forEach(ref => {
      const selectedCombo = ref.availableCombos.find(c => c.comboName === ref.selectedCombo);
      if (!selectedCombo || ref.quantityToProduce === 0) return;

      if (!comboMap.has(ref.selectedCombo)) {
        comboMap.set(ref.selectedCombo, {
          comboName: ref.selectedCombo,
          cycleTime: selectedCombo.cycleTime,
          totalQuantity: ref.quantityToProduce,
          references: [],
        });
      } else {
        // Si el combo ya existe, solo actualizamos la cantidad si es diferente
        const comboGroup = comboMap.get(ref.selectedCombo)!;
        if (comboGroup.totalQuantity !== ref.quantityToProduce) {
          comboGroup.totalQuantity = ref.quantityToProduce;
        }
      }

      const comboGroup = comboMap.get(ref.selectedCombo)!;
      
      // Agregar TODAS las referencias que produce este combo según allComponents
      selectedCombo.allComponents.forEach(component => {
        // Verificar si ya existe esta referencia en el grupo para evitar duplicados
        const existingRef = comboGroup.references.find(r => r.referenceId === component.componentId);
        
        if (!existingRef) {
          const producedQuantity = ref.quantityToProduce * component.quantityPerCombo;
          comboGroup.references.push({
            referenceId: component.componentId,
            quantity: producedQuantity,
          });
        }
      });
    });

    return Array.from(comboMap.values()).sort((a, b) => a.comboName.localeCompare(b.comboName));
  }, [references]);

  const formatTime = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const handleComboQuantityChange = (comboName: string, newTotalQuantity: number) => {
    onQuantityChange(comboName, Math.max(0, newTotalQuantity));
  };

  if (combosGrouped.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <Boxes className="h-16 w-16 mx-auto mb-4 opacity-50" />
          <p>No hay combos configurados todavía.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header con contador de combos */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Boxes className="h-6 w-6 text-primary" />
              <div>
                <h3 className="font-semibold text-lg">Vista por Combo</h3>
                <p className="text-sm text-muted-foreground">
                  Mostrando {combosGrouped.length} combo(s) configurado(s)
                </p>
              </div>
            </div>
            <div className="text-right">
              <Badge variant="secondary" className="text-base px-4 py-2">
                {combosGrouped.length} Combos
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {combosGrouped.map((combo) => {
        const totalTime = combo.cycleTime * combo.totalQuantity;

        return (
          <Card key={combo.comboName} className="border-l-4 border-l-primary">
            <CardContent className="pt-6">
              <div className="space-y-4">
                {/* Header del combo */}
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-lg">{combo.comboName}</h3>
                      <Badge variant="outline" className="text-xs">
                        {combo.cycleTime.toFixed(2)} min/combo
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Produce {combo.references.length} referencia(s)
                    </p>
                  </div>

                  {/* Cantidad total del combo */}
                  <div className="text-right space-y-1">
                    <Label className="text-xs text-muted-foreground">Cantidad de Combos</Label>
                    <Input
                      type="number"
                      min="0"
                      value={combo.totalQuantity}
                      onChange={(e) => handleComboQuantityChange(combo.comboName, parseInt(e.target.value) || 0)}
                      className="w-32 text-right font-mono"
                    />
                  </div>
                </div>

                {/* Tiempo total */}
                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <span className="text-sm font-medium">Tiempo Total:</span>
                  <span className="text-lg font-bold text-primary">{formatTime(totalTime)}</span>
                </div>

                {/* Lista de referencias que produce este combo */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Referencias producidas:</Label>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                    {combo.references.map((ref) => (
                      <div
                        key={ref.referenceId}
                        className="p-2 border rounded-md bg-card text-sm"
                      >
                        <div className="font-medium truncate">{ref.referenceId}</div>
                        <div className="text-xs text-muted-foreground">
                          {combo.totalQuantity} combo(s) → {ref.quantity.toLocaleString()} unidades
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};
