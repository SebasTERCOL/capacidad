import React from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Boxes, ChevronDown, ChevronRight } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
  // Agrupar referencias por combo usando las entradas directas de combos (CMB.*)
  const combosGrouped = React.useMemo(() => {
    const comboMap = new Map<string, ComboGrouped>();

    // Primero, tomar solo las referencias cuyo propio ID es el combo (CMB.*)
    const directComboRefs = references.filter(ref =>
      ref.referenceId.toUpperCase().startsWith('CMB.') &&
      ref.quantityToProduce > 0
    );

    directComboRefs.forEach(ref => {
      const selectedCombo = ref.availableCombos.find(c => c.comboName === ref.selectedCombo);
      if (!selectedCombo) return;

      if (!comboMap.has(ref.selectedCombo)) {
        comboMap.set(ref.selectedCombo, {
          comboName: ref.selectedCombo,
          cycleTime: selectedCombo.cycleTime,
          totalQuantity: ref.quantityToProduce,
          references: [],
        });
      } else {
        // Si el combo ya existe, sincronizar cantidad total si cambió
        const comboGroup = comboMap.get(ref.selectedCombo)!;
        if (comboGroup.totalQuantity !== ref.quantityToProduce) {
          comboGroup.totalQuantity = ref.quantityToProduce;
        }
      }

      const comboGroup = comboMap.get(ref.selectedCombo)!;

      // Agregar TODAS las referencias definidas en el combo (independiente de la demanda)
      selectedCombo.allComponents.forEach(component => {
        const existingRef = comboGroup.references.find(r => r.referenceId === component.componentId);

        const producedQuantity = ref.quantityToProduce * component.quantityPerCombo;

        if (!existingRef) {
          comboGroup.references.push({
            referenceId: component.componentId,
            quantity: producedQuantity,
          });
        } else {
          // Acumular por si el mismo combo se procesa desde varias entradas
          existingRef.quantity += producedQuantity;
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

  const [expandedCombos, setExpandedCombos] = React.useState<Set<string>>(new Set());

  const toggleComboExpansion = (comboName: string) => {
    setExpandedCombos((prev) => {
      const next = new Set(prev);
      if (next.has(comboName)) {
        next.delete(comboName);
      } else {
        next.add(comboName);
      }
      return next;
    });
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
        const isExpanded = expandedCombos.has(combo.comboName);

        return (
          <Collapsible
            key={combo.comboName}
            open={isExpanded}
            onOpenChange={() => toggleComboExpansion(combo.comboName)}
          >
            <Card className="border-l-4 border-l-primary">
              <CardContent className="pt-4">
                <div className="space-y-3">
                  {/* Header del combo (siempre visible) */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1">
                      <CollapsibleTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 mt-1"
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </Button>
                      </CollapsibleTrigger>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-lg">{combo.comboName}</h3>
                          <Badge variant="outline" className="text-xs">
                            {combo.cycleTime.toFixed(2)} min/combo
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Produce {combo.references.length} referencia(s)
                        </p>
                      </div>
                    </div>

                    {/* Cantidad total del combo y tiempo total (siempre visibles) */}
                    <div className="text-right space-y-2">
                      <div>
                        <Label className="text-xs text-muted-foreground">Cantidad de Combos</Label>
                        <Input
                          type="number"
                          min="0"
                          value={combo.totalQuantity}
                          onChange={(e) =>
                            handleComboQuantityChange(
                              combo.comboName,
                              parseInt(e.target.value) || 0
                            )
                          }
                          className="w-32 text-right font-mono"
                        />
                      </div>
                      <div className="p-2 bg-muted rounded-md">
                        <span className="block text-[11px] text-muted-foreground">
                          Tiempo Total
                        </span>
                        <span className="text-sm font-semibold text-primary">
                          {formatTime(totalTime)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Contenido expandible: referencias producidas */}
                  <CollapsibleContent>
                    <div className="space-y-2 mt-3">
                      <Label className="text-xs text-muted-foreground">
                        Referencias producidas:
                      </Label>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                        {combo.references.map((ref) => (
                          <div
                            key={ref.referenceId}
                            className="p-2 border rounded-md bg-card text-sm"
                          >
                            <div className="font-medium truncate">
                              {ref.referenceId}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {combo.totalQuantity} combo(s) →
                              {" "}
                              {ref.quantity.toLocaleString()} unidades
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CollapsibleContent>
                </div>
              </CardContent>
            </Card>
          </Collapsible>
        );
      })}
    </div>
  );
};
