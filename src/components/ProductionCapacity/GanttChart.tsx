import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScheduleNode } from "./ScheduleEngine";
import { ScrollArea } from "@/components/ui/scroll-area";

interface GanttChartProps {
  nodes: ScheduleNode[];
}

const GanttChart: React.FC<GanttChartProps> = ({ nodes }) => {
  const [filterMachine, setFilterMachine] = useState<string | null>(null);

  const makespan = nodes[0]?.makespan ?? 0;

  const machines = useMemo(() => {
    const set = new Set<string>();
    nodes.forEach(n => set.add(n.mejor_maquina));
    return Array.from(set).sort();
  }, [nodes]);

  const filteredNodes = useMemo(() => {
    const sorted = [...nodes].sort((a, b) => a.es - b.es || a.ef - b.ef);
    if (filterMachine) return sorted.filter(n => n.mejor_maquina === filterMachine);
    return sorted;
  }, [nodes, filterMachine]);

  // Group by machine for RCPSP visualization
  const machineRows = useMemo(() => {
    const map = new Map<string, ScheduleNode[]>();
    for (const n of filteredNodes) {
      const key = n.mejor_maquina;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(n);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredNodes]);

  const toPercent = (val: number) => makespan > 0 ? (val / makespan) * 100 : 0;

  const formatTime = (min: number) => {
    if (min < 60) return `${Math.round(min)}min`;
    if (min < 1440) return `${(min / 60).toFixed(1)}h`;
    return `${(min / 1440).toFixed(1)}d`;
  };

  // Color palette for references
  const refColors = useMemo(() => {
    const refs = [...new Set(nodes.map(n => n.referencia))];
    const palette = [
      'hsl(221, 83%, 53%)', 'hsl(142, 71%, 45%)', 'hsl(38, 92%, 50%)',
      'hsl(262, 83%, 58%)', 'hsl(198, 93%, 60%)', 'hsl(340, 82%, 52%)',
      'hsl(25, 95%, 53%)', 'hsl(173, 80%, 40%)', 'hsl(291, 64%, 42%)',
      'hsl(47, 96%, 53%)', 'hsl(199, 89%, 48%)', 'hsl(0, 72%, 51%)',
    ];
    const map = new Map<string, string>();
    refs.forEach((r, i) => map.set(r, palette[i % palette.length]));
    return map;
  }, [nodes]);

  if (nodes.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base">Gantt RCPSP — Nodos por Referencia × Máquina</CardTitle>
          <div className="text-xs text-muted-foreground">
            Makespan: <span className="font-semibold text-foreground">{formatTime(makespan)}</span>
          </div>
        </div>
        {/* Machine filter */}
        <div className="flex flex-wrap gap-1 mt-2">
          <Badge
            variant={filterMachine === null ? "default" : "outline"}
            className="cursor-pointer text-xs"
            onClick={() => setFilterMachine(null)}
          >
            Todas ({machines.length})
          </Badge>
          {machines.map(m => (
            <Badge
              key={m}
              variant={filterMachine === m ? "default" : "outline"}
              className="cursor-pointer text-xs"
              onClick={() => setFilterMachine(filterMachine === m ? null : m)}
            >
              {m}
            </Badge>
          ))}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="w-full" style={{ maxHeight: '600px' }}>
          <div className="min-w-[600px] p-4">
            {/* Time axis */}
            <div className="flex items-center mb-2 ml-[140px] text-xs text-muted-foreground">
              <span>0</span>
              <span className="flex-1 text-center">{formatTime(makespan / 2)}</span>
              <span>{formatTime(makespan)}</span>
            </div>

            {machineRows.map(([machine, machineNodes]) => (
              <div key={machine} className="mb-3">
                {/* Machine label */}
                <div className="text-xs font-semibold text-muted-foreground mb-1 pl-1">
                  {machine}
                </div>
                {/* Bars for each node */}
                {machineNodes.map((node, idx) => {
                  const left = toPercent(node.es);
                  const width = Math.max(toPercent(node.duracion_min), 0.3);
                  const color = node.is_critical
                    ? 'hsl(0, 72%, 51%)'
                    : refColors.get(node.referencia) || 'hsl(221, 83%, 53%)';

                  return (
                    <div key={`${node.referencia}-${node.proceso_id}-${idx}`} className="flex items-center h-7 mb-0.5 group">
                      {/* Ref + Process label */}
                      <div className="w-[140px] flex-shrink-0 text-[10px] truncate pr-2 text-right text-muted-foreground">
                        <span className="font-medium text-foreground">{node.referencia}</span>
                        <span className="ml-1">· {node.proceso_nombre}</span>
                      </div>
                      {/* Timeline bar */}
                      <div className="flex-1 relative h-full bg-muted/30 rounded-sm">
                        <div
                          className="absolute top-0.5 bottom-0.5 rounded-sm transition-opacity group-hover:opacity-100 opacity-85"
                          style={{
                            left: `${left}%`,
                            width: `${width}%`,
                            backgroundColor: color,
                            minWidth: '2px',
                          }}
                          title={`${node.referencia} → ${node.proceso_nombre} (${node.mejor_maquina})\nES: ${Math.round(node.es)} → EF: ${Math.round(node.ef)} min\nDuración: ${formatTime(node.duracion_min)}\nCantidad: ${Math.round(node.cantidad).toLocaleString()}\n${node.is_critical ? '⚠ RUTA CRÍTICA' : `Slack: ${formatTime(node.slack)}`}`}
                        >
                          {width > 5 && (
                            <span className="absolute inset-0 flex items-center justify-center text-[9px] text-white font-medium truncate px-1">
                              {node.referencia}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* Legend */}
        <div className="flex items-center gap-4 px-4 pb-3 pt-1 text-xs text-muted-foreground justify-center border-t flex-wrap">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm bg-destructive inline-block" /> Ruta Crítica
          </span>
          {Array.from(refColors.entries()).slice(0, 8).map(([ref, color]) => (
            <span key={ref} className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: color }} />
              {ref}
            </span>
          ))}
          {refColors.size > 8 && <span>+{refColors.size - 8} más</span>}
        </div>
      </CardContent>
    </Card>
  );
};

export default GanttChart;
