import React, { useMemo } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Clock, AlertTriangle, CheckCircle, Calendar, Layers } from "lucide-react";
import { ScheduleNode } from "./ScheduleEngine";

interface MakespanSummaryProps {
  nodes: ScheduleNode[];
}

const MakespanSummary: React.FC<MakespanSummaryProps> = ({ nodes }) => {
  // Bottleneck detection
  const bottleneck = useMemo(() => {
    if (nodes.length === 0) return null;
    const makespan = nodes[0]?.makespan ?? 0;
    if (makespan <= 0) return null;
    const maxNode = nodes.reduce((max, n) => n.duracion_min > max.duracion_min ? n : max, nodes[0]);
    const pct = (maxNode.duracion_min / makespan) * 100;
    if (pct > 50) return { ref: maxNode.referencia, process: maxNode.proceso_nombre, durMin: maxNode.duracion_min, pct };
    return null;
  }, [nodes]);

  if (nodes.length === 0) return null;

  const makespan = nodes[0]?.makespan ?? 0;
  const diasHabiles = nodes[0]?.dias_habiles ?? 0;
  const criticalNodes = nodes.filter(n => n.is_critical);
  const overflowNodes = nodes.filter(n => n.desborda);
  const uniqueProcesses = new Set(nodes.map(n => n.proceso_nombre)).size;
  const uniqueRefs = new Set(nodes.map(n => n.referencia)).size;

  const makespanHours = (makespan / 60).toFixed(1);
  const makespanDays = (makespan / (7.83 * 60)).toFixed(1);

  const stats = [
    {
      icon: Clock,
      label: "Makespan Total",
      value: `${makespanHours}h`,
      sublabel: `${makespanDays} días laborales · ${makespan.toFixed(0)} min`,
      color: "text-primary",
    },
    {
      icon: Calendar,
      label: "Días Hábiles",
      value: `${diasHabiles}`,
      sublabel: "Disponibles en el mes",
      color: "text-blue-500",
    },
    {
      icon: AlertTriangle,
      label: "Ruta Crítica",
      value: `${criticalNodes.length}`,
      sublabel: `de ${nodes.length} nodos totales`,
      color: criticalNodes.length > 0 ? "text-red-500" : "text-muted-foreground",
    },
    {
      icon: overflowNodes.length > 0 ? AlertTriangle : CheckCircle,
      label: "Overflow",
      value: `${overflowNodes.length}`,
      sublabel: overflowNodes.length > 0 ? "procesos desbordan" : "Sin desborde",
      color: overflowNodes.length > 0 ? "text-destructive" : "text-green-600",
    },
    {
      icon: Layers,
      label: "Procesos",
      value: `${uniqueProcesses}`,
      sublabel: `${uniqueRefs} referencias`,
      color: "text-muted-foreground",
    },
  ];

  return (
    <div className="space-y-3">
      {bottleneck && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Cuello de botella detectado</AlertTitle>
          <AlertDescription>
            <strong>{bottleneck.ref}</strong> en <strong>{bottleneck.process}</strong> representa el{' '}
            <Badge variant="destructive" className="text-xs">{bottleneck.pct.toFixed(0)}%</Badge> del makespan total
            ({(bottleneck.durMin / 60).toFixed(0)}h / {(bottleneck.durMin / (7.83 * 60)).toFixed(0)} días).
            Verifica el SAM de esta referencia en machines_processes.
          </AlertDescription>
        </Alert>
      )}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {stats.map((stat, i) => (
          <Card key={i} className="border">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <stat.icon className={`h-5 w-5 mt-0.5 ${stat.color}`} />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground truncate">{stat.label}</p>
                  <p className="text-xl font-bold">{stat.value}</p>
                  <p className="text-xs text-muted-foreground truncate">{stat.sublabel}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default MakespanSummary;
