import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScheduleNode } from "./ScheduleEngine";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';

interface GanttChartProps {
  nodes: ScheduleNode[];
}

const GanttChart: React.FC<GanttChartProps> = ({ nodes }) => {
  const chartData = useMemo(() => {
    // Group by process, showing aggregated timeline
    const processMap = new Map<string, { name: string; es: number; ef: number; duration: number; critical: boolean; refs: string[] }>();

    for (const n of nodes) {
      const key = `${n.proceso_nombre}|${n.mejor_maquina}`;
      const existing = processMap.get(key);
      if (existing) {
        existing.es = Math.min(existing.es, n.es);
        existing.ef = Math.max(existing.ef, n.ef);
        existing.duration = existing.ef - existing.es;
        existing.critical = existing.critical || n.is_critical;
        if (!existing.refs.includes(n.referencia)) existing.refs.push(n.referencia);
      } else {
        processMap.set(key, {
          name: `${n.proceso_nombre} (${n.mejor_maquina})`,
          es: n.es,
          ef: n.ef,
          duration: n.ef - n.es,
          critical: n.is_critical,
          refs: [n.referencia],
        });
      }
    }

    return Array.from(processMap.values())
      .sort((a, b) => a.es - b.es || a.ef - b.ef)
      .map(p => ({
        name: p.name,
        start: Math.round(p.es),
        duration: Math.round(p.duration),
        critical: p.critical,
        refs: p.refs.join(', '),
        end: Math.round(p.ef),
      }));
  }, [nodes]);

  const makespan = nodes[0]?.makespan ?? 0;

  if (chartData.length === 0) return null;

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div className="bg-popover border rounded-lg p-3 shadow-lg text-sm">
        <p className="font-semibold">{d.name}</p>
        <p className="text-muted-foreground">ES: {d.start} min → EF: {d.end} min</p>
        <p className="text-muted-foreground">Duración: {d.duration} min ({(d.duration / 60).toFixed(1)}h)</p>
        <p className="text-xs mt-1">{d.refs}</p>
        {d.critical && <p className="text-red-500 font-medium mt-1">⚠ Ruta Crítica</p>}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Diagrama Gantt — Timeline de Procesos</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={Math.max(200, chartData.length * 40 + 60)}>
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 5, right: 30, left: 120, bottom: 20 }}
            barCategoryGap="20%"
          >
            <XAxis
              type="number"
              domain={[0, Math.ceil(makespan)]}
              label={{ value: 'Minutos', position: 'insideBottom', offset: -10 }}
              tickFormatter={(v) => `${v}`}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={110}
              tick={{ fontSize: 11 }}
            />
            <Tooltip content={<CustomTooltip />} />
            {/* Invisible bar for the start offset */}
            <Bar dataKey="start" stackId="gantt" fill="transparent" />
            {/* Visible bar for the duration */}
            <Bar dataKey="duration" stackId="gantt" radius={[4, 4, 4, 4]}>
              {chartData.map((entry, index) => (
                <Cell
                  key={index}
                  fill={entry.critical ? 'hsl(0, 72%, 51%)' : 'hsl(221, 83%, 53%)'}
                  opacity={0.85}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground justify-center">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm bg-primary inline-block" /> Normal
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm bg-destructive inline-block" /> Ruta Crítica
          </span>
        </div>
      </CardContent>
    </Card>
  );
};

export default GanttChart;
