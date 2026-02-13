import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, RefreshCw, Loader2, BarChart3, Table2, Activity } from "lucide-react";
import { OperatorConfig } from "./OperatorConfiguration";
import { calculateSchedule, ScheduleNode } from "./ScheduleEngine";
import MakespanSummary from "./MakespanSummary";
import GanttChart from "./GanttChart";
import ProcessTimeline from "./ProcessTimeline";

interface ScheduleResultsProps {
  data: { referencia: string; cantidad: number }[];
  operatorConfig: OperatorConfig;
  onBack: () => void;
}

const ScheduleResults: React.FC<ScheduleResultsProps> = ({ data, operatorConfig, onBack }) => {
  const [nodes, setNodes] = useState<ScheduleNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runSchedule = async () => {
    if (data.length === 0) return;
    setLoading(true);
    setError(null);

    try {
      const references = data.map(d => d.referencia);
      const quantities = data.map(d => d.cantidad);

      // Build operators map from operatorConfig
      const operators: Record<string, number> = {};
      for (const proc of operatorConfig.processes) {
        operators[String(proc.processId)] = proc.operatorCount;
      }

      const result = await calculateSchedule({
        references,
        quantities,
        month: operatorConfig.workMonth,
        year: operatorConfig.workYear,
        hoursPerShift: operatorConfig.availableHours > 0
          ? operatorConfig.availableHours / (operatorConfig.processes[0]?.operatorCount || 1) / ((operatorConfig as any).workingDays || 25)
          : 7.83,
        operators,
      });

      setNodes(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runSchedule();
  }, [data, operatorConfig]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Volver
          </Button>
          <div>
            <h2 className="text-lg font-bold">Scheduling de Producción</h2>
            <p className="text-sm text-muted-foreground">
              CPM + RCPSP · {data.length} referencias · {operatorConfig.workMonth}/{operatorConfig.workYear}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={runSchedule} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
          Recalcular
        </Button>
      </div>

      {/* Loading / Error */}
      {loading && (
        <Card>
          <CardContent className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary mr-3" />
            <span className="text-muted-foreground">Calculando schedule con CPM + RCPSP...</span>
          </CardContent>
        </Card>
      )}

      {error && (
        <Card className="border-destructive">
          <CardContent className="py-6 text-destructive">
            <p className="font-medium">Error en el cálculo</p>
            <p className="text-sm mt-1">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {!loading && !error && nodes.length > 0 && (
        <>
          <MakespanSummary nodes={nodes} />

          <Tabs defaultValue="gantt" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="gantt" className="flex items-center gap-1">
                <BarChart3 className="h-4 w-4" />
                Gantt
              </TabsTrigger>
              <TabsTrigger value="timeline" className="flex items-center gap-1">
                <Table2 className="h-4 w-4" />
                Detalle ES/EF
              </TabsTrigger>
              <TabsTrigger value="critical" className="flex items-center gap-1">
                <Activity className="h-4 w-4" />
                Ruta Crítica
              </TabsTrigger>
            </TabsList>

            <TabsContent value="gantt" className="mt-4">
              <GanttChart nodes={nodes} />
            </TabsContent>

            <TabsContent value="timeline" className="mt-4">
              <ProcessTimeline nodes={nodes} />
            </TabsContent>

            <TabsContent value="critical" className="mt-4">
              <ProcessTimeline nodes={nodes.filter(n => n.is_critical)} />
            </TabsContent>
          </Tabs>
        </>
      )}

      {!loading && !error && nodes.length === 0 && data.length > 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No se encontraron nodos de scheduling para las referencias proporcionadas.
            Verifica que las referencias tengan procesos configurados en machines_processes.
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ScheduleResults;
