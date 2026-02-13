import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScheduleNode } from "./ScheduleEngine";

interface ProcessTimelineProps {
  nodes: ScheduleNode[];
}

type SortField = 'es' | 'ef' | 'slack' | 'duracion_min' | 'referencia' | 'proceso_nombre';

const ProcessTimeline: React.FC<ProcessTimelineProps> = ({ nodes }) => {
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('es');
  const [sortAsc, setSortAsc] = useState(true);
  const [showCriticalOnly, setShowCriticalOnly] = useState(false);

  const filtered = nodes
    .filter(n => {
      const matchSearch = !search || 
        n.referencia.toLowerCase().includes(search.toLowerCase()) ||
        n.proceso_nombre.toLowerCase().includes(search.toLowerCase()) ||
        n.mejor_maquina.toLowerCase().includes(search.toLowerCase());
      const matchCritical = !showCriticalOnly || n.is_critical;
      return matchSearch && matchCritical;
    })
    .sort((a, b) => {
      const va = a[sortField] ?? 0;
      const vb = b[sortField] ?? 0;
      if (typeof va === 'string' && typeof vb === 'string') {
        return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      return sortAsc ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(true); }
  };

  const getCapacityColor = (pct: number) => {
    if (pct >= 100) return 'text-red-600 font-bold';
    if (pct >= 80) return 'text-orange-500 font-semibold';
    if (pct >= 40) return 'text-green-600';
    return 'text-muted-foreground';
  };

  const SortHeader = ({ field, label }: { field: SortField; label: string }) => (
    <Button variant="ghost" size="sm" className="h-auto p-0 font-medium text-xs" onClick={() => toggleSort(field)}>
      {label}
      <ArrowUpDown className="ml-1 h-3 w-3" />
    </Button>
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base">Detalle por Nodo (ES/EF/LS/LF)</CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant={showCriticalOnly ? "default" : "outline"}
              size="sm"
              onClick={() => setShowCriticalOnly(!showCriticalOnly)}
            >
              {showCriticalOnly ? "Ruta Crítica" : "Todos"}
            </Button>
            <div className="relative">
              <Search className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 w-48"
              />
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead><SortHeader field="referencia" label="Referencia" /></TableHead>
                <TableHead><SortHeader field="proceso_nombre" label="Proceso" /></TableHead>
                <TableHead>Máquina</TableHead>
                <TableHead className="text-right">Cant</TableHead>
                <TableHead className="text-right"><SortHeader field="duracion_min" label="Duración" /></TableHead>
                <TableHead className="text-right"><SortHeader field="es" label="ES" /></TableHead>
                <TableHead className="text-right">EF</TableHead>
                <TableHead className="text-right">LS</TableHead>
                <TableHead className="text-right">LF</TableHead>
                <TableHead className="text-right"><SortHeader field="slack" label="Slack" /></TableHead>
                <TableHead className="text-right">Cap%</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((n, i) => (
                <TableRow key={i} className={n.is_critical ? 'bg-red-50 dark:bg-red-950/20' : ''}>
                  <TableCell className="font-mono text-xs">{n.referencia}</TableCell>
                  <TableCell className="text-sm">{n.proceso_nombre}</TableCell>
                  <TableCell className="font-mono text-xs">{n.mejor_maquina}</TableCell>
                  <TableCell className="text-right text-sm">{n.cantidad.toLocaleString()}</TableCell>
                  <TableCell className="text-right text-sm">{n.duracion_min.toFixed(1)}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{n.es.toFixed(1)}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{n.ef.toFixed(1)}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{n.ls.toFixed(1)}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{n.lf.toFixed(1)}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{n.slack.toFixed(1)}</TableCell>
                  <TableCell className={`text-right text-sm ${getCapacityColor(n.porcentaje_capacidad)}`}>
                    {n.porcentaje_capacidad.toFixed(1)}%
                  </TableCell>
                  <TableCell>
                    {n.is_critical && <Badge variant="destructive" className="text-xs">Crítico</Badge>}
                    {n.desborda && <Badge variant="outline" className="text-xs border-red-400 text-red-600 ml-1">Overflow</Badge>}
                    {!n.is_critical && !n.desborda && <Badge variant="secondary" className="text-xs">OK</Badge>}
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={12} className="text-center text-muted-foreground py-8">
                    No se encontraron nodos
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className="px-4 py-2 text-xs text-muted-foreground border-t">
          {filtered.length} de {nodes.length} nodos · ES=Earliest Start · EF=Earliest Finish · LS=Latest Start · LF=Latest Finish
        </div>
      </CardContent>
    </Card>
  );
};

export default ProcessTimeline;
