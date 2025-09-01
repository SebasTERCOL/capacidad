import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Clock, Cog, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ProductionRequest } from "./FileUpload";

interface ProjectionInfo {
  referencia: string;
  cantidadRequerida: number;
  sam: number;
  tiempoTotal: number;
  maquina: string;
  estadoMaquina: string;
  proceso: string;
  alerta: string | null;
}

interface ProductionProjectionProps {
  data: ProductionRequest[];
  onNext: () => void;
  onBack: () => void;
  onProjectionComplete: (projection: ProjectionInfo[]) => void;
}

export const ProductionProjection: React.FC<ProductionProjectionProps> = ({ 
  data, 
  onNext, 
  onBack, 
  onProjectionComplete 
}) => {
  const [projection, setProjection] = useState<ProjectionInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (data.length > 0) {
      calculateProjection();
    }
  }, [data]);

  const calculateProjection = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const results: ProjectionInfo[] = [];
      
      for (const item of data) {
        // Obtener tiempo por unidad desde products y (opcional) info de máquina/proceso
        const [prodResp, mpResp] = await Promise.all([
          supabase
            .from('products')
            .select('time')
            .eq('reference', item.referencia)
            .limit(1),
          supabase
            .from('machines_processes')
            .select(`
              sam,
              frequency,
              id_machine,
              id_process,
              machines!inner(name, status),
              processes!inner(name)
            `)
            .eq('ref', item.referencia)
        ]);

        // Tiempo por unidad (segundos) ahora proviene de products.time
        const productRow = prodResp.data && prodResp.data[0] ? prodResp.data[0] as { time?: number | string } : null;
        const parsedTime = productRow?.time !== undefined && productRow?.time !== null
          ? Number(productRow.time)
          : 0;
        const sam = isNaN(parsedTime) ? 0 : parsedTime; // segundos por unidad
        const tiempoTotal = (item.cantidad * sam) / 60; // minutos

        // Preparar info de máquina/proceso si existe en machines_processes
        let maquina = 'N/A';
        let estadoMaquina = 'N/A';
        let proceso = 'N/A';
        let alerta: string | null = null;

        if (mpResp.error) {
          console.error('Error fetching machine process:', mpResp.error);
          alerta = 'No se pudo obtener información de máquina/proceso';
        } else if (mpResp.data && mpResp.data.length > 0) {
          const mp: any = mpResp.data[0];
          maquina = mp.machines?.name ?? 'N/A';
          estadoMaquina = mp.machines?.status ?? 'N/A';
          proceso = mp.processes?.name ?? 'N/A';
          if (estadoMaquina !== 'ENCENDIDO') {
            alerta = `Máquina en estado: ${estadoMaquina}`;
          }
        } else {
          alerta = 'No se encontró configuración de máquina/proceso';
        }

        results.push({
          referencia: item.referencia,
          cantidadRequerida: item.cantidad,
          sam,
          tiempoTotal,
          maquina,
          estadoMaquina,
          proceso,
          alerta,
        });
      }
      
      setProjection(results);
      onProjectionComplete(results);
    } catch (error) {
      console.error('Error calculating projection:', error);
      setError('Error al calcular la proyección. Verifique la conexión a la base de datos.');
    }
    
    setLoading(false);
  };

  const formatTime = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${hours}h ${mins}m`;
  };

  const getStatusVariant = (status: string) => {
    switch (status?.toUpperCase()) {
      case 'ENCENDIDO': return 'default';
      case 'APAGADO': return 'secondary';
      case 'MANTENIMIENTO': return 'destructive';
      default: return 'secondary';
    }
  };

  const totalTime = projection.reduce((sum, item) => sum + item.tiempoTotal, 0);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="animate-spin h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p>Calculando proyección de producción...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-4" />
          <p className="text-red-500 mb-4">{error}</p>
          <Button onClick={() => calculateProjection()}>Reintentar</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Proyección de Producción
          </CardTitle>
          <CardDescription>
            Tiempo proyectado y estado de máquinas
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Resumen General</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center p-4 bg-muted rounded-lg">
              <div className="text-2xl font-bold text-primary">{projection.length}</div>
              <div className="text-sm text-muted-foreground">Referencias</div>
            </div>
            <div className="text-center p-4 bg-muted rounded-lg">
              <div className="text-2xl font-bold text-primary">{formatTime(totalTime)}</div>
              <div className="text-sm text-muted-foreground">Tiempo Total</div>
            </div>
            <div className="text-center p-4 bg-muted rounded-lg">
              <div className="text-2xl font-bold text-primary">
                {projection.filter(p => p.alerta).length}
              </div>
              <div className="text-sm text-muted-foreground">Alertas</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Detalle por Referencia</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Referencia</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
                <TableHead className="text-right">SAM (seg/un)</TableHead>
                <TableHead className="text-right">Tiempo Total</TableHead>
                <TableHead>Máquina</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Proceso</TableHead>
                <TableHead>Alertas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projection.map((item, index) => (
                <TableRow key={index}>
                  <TableCell className="font-medium">{item.referencia}</TableCell>
                  <TableCell className="text-right">{item.cantidadRequerida.toLocaleString()}</TableCell>
                  <TableCell className="text-right">{item.sam}</TableCell>
                  <TableCell className="text-right font-medium">{formatTime(item.tiempoTotal)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Cog className="h-4 w-4" />
                      {item.maquina}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={getStatusVariant(item.estadoMaquina)}>
                      {item.estadoMaquina}
                    </Badge>
                  </TableCell>
                  <TableCell>{item.proceso}</TableCell>
                  <TableCell>
                    {item.alerta && (
                      <Badge variant="destructive" className="flex items-center gap-1 w-fit">
                        <AlertCircle className="h-3 w-3" />
                        {item.alerta}
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button variant="outline" onClick={onBack}>
          Volver
        </Button>
        <Button onClick={onNext} className="flex-1">
          Ver Reporte Final
        </Button>
      </div>
    </div>
  );
};