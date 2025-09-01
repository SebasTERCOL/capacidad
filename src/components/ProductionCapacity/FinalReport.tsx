import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Download, AlertTriangle, CheckCircle, Clock, Package, Cog } from "lucide-react";

interface FinalReportProps {
  productionData: any[];
  componentValidation: any[];
  projectionData: any[];
  onBack: () => void;
  onStartOver: () => void;
}

export const FinalReport: React.FC<FinalReportProps> = ({
  productionData,
  componentValidation,
  projectionData,
  onBack,
  onStartOver
}) => {
  // Calcular estadísticas
  const totalReferences = productionData.length;
  const totalQuantity = productionData.reduce((sum, item) => sum + item.cantidad, 0);
  const totalTime = projectionData.reduce((sum, item) => sum + item.tiempoTotal, 0);
  
  const componentAlerts = componentValidation.flatMap(item => 
    item.componentes.filter(comp => comp.alerta !== 'ok')
  ).length;
  
  const machineAlerts = projectionData.filter(item => item.alerta).length;
  
  const criticalIssues = componentValidation.flatMap(item => 
    item.componentes.filter(comp => comp.alerta === 'error')
  ).length;

  const formatTime = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    
    if (days > 0) {
      return `${days}d ${remainingHours}h ${mins}m`;
    }
    return `${hours}h ${mins}m`;
  };

  const exportToCSV = () => {
    // Crear datos para exportar
    const exportData = productionData.map(item => {
      const validation = componentValidation.find(v => v.referencia === item.referencia);
      const projection = projectionData.find(p => p.referencia === item.referencia);
      
      return {
        Referencia: item.referencia,
        'Cantidad Requerida': item.cantidad,
        'Tiempo Proyectado (min)': projection?.tiempoTotal || 0,
        'Máquina': projection?.maquina || 'N/A',
        'Estado Máquina': projection?.estadoMaquina || 'N/A',
        'Proceso': projection?.proceso || 'N/A',
        'Componentes con Problemas': validation?.componentes.filter(c => c.alerta !== 'ok').length || 0,
        'Alertas': [
          ...(validation?.componentes.filter(c => c.alerta === 'error').map(c => c.mensaje) || []),
          ...(projection?.alerta ? [projection.alerta] : [])
        ].join('; ')
      };
    });

    const csv = [
      Object.keys(exportData[0]).join(','),
      ...exportData.map(row => Object.values(row).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte_capacidad_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Reporte Final de Capacidad
          </CardTitle>
          <CardDescription>
            Resumen consolidado del análisis de capacidad de producción
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Resumen Ejecutivo */}
      <Card>
        <CardHeader>
          <CardTitle>Resumen Ejecutivo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-muted rounded-lg">
              <Package className="h-8 w-8 mx-auto mb-2 text-primary" />
              <div className="text-2xl font-bold">{totalReferences}</div>
              <div className="text-sm text-muted-foreground">Referencias</div>
            </div>
            <div className="text-center p-4 bg-muted rounded-lg">
              <div className="text-2xl font-bold">{totalQuantity.toLocaleString()}</div>
              <div className="text-sm text-muted-foreground">Unidades Totales</div>
            </div>
            <div className="text-center p-4 bg-muted rounded-lg">
              <Clock className="h-8 w-8 mx-auto mb-2 text-primary" />
              <div className="text-2xl font-bold">{formatTime(totalTime)}</div>
              <div className="text-sm text-muted-foreground">Tiempo Total</div>
            </div>
            <div className="text-center p-4 bg-muted rounded-lg">
              <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-orange-500" />
              <div className="text-2xl font-bold">{componentAlerts + machineAlerts}</div>
              <div className="text-sm text-muted-foreground">Alertas Totales</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Estado General */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Package className="h-5 w-5" />
              Componentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>Críticos:</span>
                <Badge variant={criticalIssues > 0 ? "destructive" : "default"}>
                  {criticalIssues}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span>Advertencias:</span>
                <Badge variant="secondary">
                  {componentAlerts - criticalIssues}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span>Sin problemas:</span>
                <Badge variant="default">
                  {componentValidation.flatMap(v => v.componentes).length - componentAlerts}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Cog className="h-5 w-5" />
              Máquinas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>Disponibles:</span>
                <Badge variant="default">
                  {projectionData.filter(p => p.estadoMaquina === 'ENCENDIDO').length}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span>Con alertas:</span>
                <Badge variant="destructive">
                  {machineAlerts}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span>Total únicas:</span>
                <Badge variant="secondary">
                  {new Set(projectionData.map(p => p.maquina)).size}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Producción
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>Tiempo promedio:</span>
                <span className="font-medium">
                  {formatTime(totalTime / totalReferences)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Referencias largas:</span>
                <Badge variant="secondary">
                  {projectionData.filter(p => p.tiempoTotal > 60).length}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span>Sin configurar:</span>
                <Badge variant="destructive">
                  {projectionData.filter(p => p.sam === 0).length}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Issues Críticos */}
      {criticalIssues > 0 && (
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="text-lg text-red-600 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Issues Críticos que Requieren Atención
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {componentValidation.map(item => 
                item.componentes
                  .filter(comp => comp.alerta === 'error')
                  .map((comp, index) => (
                    <div key={`${item.referencia}-${index}`} className="flex items-center gap-2 p-2 bg-red-50 rounded">
                      <AlertTriangle className="h-4 w-4 text-red-500" />
                      <span className="font-medium">{item.referencia}</span>
                      <span>→</span>
                      <span>{comp.component_id}</span>
                      <span className="text-red-600">: {comp.mensaje}</span>
                    </div>
                  ))
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recomendaciones */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <CheckCircle className="h-5 w-5" />
            Recomendaciones
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {criticalIssues > 0 && (
              <li className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5" />
                <span>Resolver problemas críticos de inventario antes de iniciar producción</span>
              </li>
            )}
            {machineAlerts > 0 && (
              <li className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-orange-500 mt-0.5" />
                <span>Verificar estado de máquinas con alertas</span>
              </li>
            )}
            <li className="flex items-start gap-2">
              <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
              <span>Considerar producción en lotes para optimizar tiempos de cambio</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
              <span>Monitorear niveles de inventario durante la producción</span>
            </li>
          </ul>
        </CardContent>
      </Card>

      {/* Acciones */}
      <div className="flex gap-2 flex-wrap">
        <Button variant="outline" onClick={onBack}>
          Volver
        </Button>
        <Button onClick={exportToCSV} className="flex items-center gap-2">
          <Download className="h-4 w-4" />
          Exportar CSV
        </Button>
        <Button variant="secondary" onClick={onStartOver} className="flex-1 md:flex-initial">
          Analizar Nuevo Pedido
        </Button>
      </div>
    </div>
  );
};