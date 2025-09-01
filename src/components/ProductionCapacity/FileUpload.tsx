import React, { useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, FileSpreadsheet, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export interface ProductionRequest {
  referencia: string;
  cantidad: number;
}

interface FileUploadProps {
  onDataProcessed: (data: ProductionRequest[]) => void;
  onNext: () => void;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onDataProcessed, onNext }) => {
  const [file, setFile] = useState<File | null>(null);
  const [data, setData] = useState<ProductionRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const parseCSV = (content: string): ProductionRequest[] => {
    const lines = content.split('\n').filter(line => line.trim());
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    
    const refIndex = headers.findIndex(h => h.includes('referencia') || h.includes('ref'));
    const quantityIndex = headers.findIndex(h => h.includes('cantidad') || h.includes('qty') || h.includes('quantity'));
    
    if (refIndex === -1 || quantityIndex === -1) {
      throw new Error('El archivo debe contener columnas "Referencia" y "Cantidad"');
    }
    
    return lines.slice(1).map(line => {
      const values = line.split(',');
      return {
        referencia: values[refIndex]?.trim() || '',
        cantidad: parseFloat(values[quantityIndex]?.trim() || '0') || 0
      };
    }).filter(item => item.referencia && item.cantidad > 0);
  };

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0] || null;
    setFile(selectedFile);
    if (!selectedFile) {
      setData([]);
    }
  }, []);

  const processFile = async () => {
    if (!file) return;
    
    setLoading(true);
    try {
      const content = await file.text();
      const parsed = parseCSV(content);
      
      if (parsed.length === 0) {
        throw new Error('No se encontraron datos válidos en el archivo');
      }
      
      setData(parsed);
      onDataProcessed(parsed);
      toast({
        title: "Archivo procesado",
        description: `Se cargaron ${parsed.length} referencias correctamente`,
      });
    } catch (error) {
      toast({
        title: "Error al procesar archivo",
        description: error instanceof Error ? error.message : "Error desconocido",
        variant: "destructive",
      });
    }
    setLoading(false);
  };

  const clearData = () => {
    setFile(null);
    setData([]);
    onDataProcessed([]);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Carga de Archivo
          </CardTitle>
          <CardDescription>
            Sube un archivo CSV con las referencias y cantidades a producir
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="file-upload">Archivo CSV</Label>
            <Input
              id="file-upload"
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="cursor-pointer"
            />
            <p className="text-sm text-muted-foreground">
              El archivo debe contener columnas: Referencia, Cantidad
            </p>
          </div>
          
          <div className="flex gap-2">
            <Button 
              onClick={processFile} 
              disabled={!file || loading}
              className="flex items-center gap-2"
            >
              <FileSpreadsheet className="h-4 w-4" />
              {loading ? 'Procesando...' : 'Procesar Archivo'}
            </Button>
            
            {data.length > 0 && (
              <Button 
                variant="outline" 
                onClick={clearData}
                className="flex items-center gap-2"
              >
                <Trash2 className="h-4 w-4" />
                Limpiar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {data.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Datos Cargados ({data.length} referencias)</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Referencia</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.slice(0, 10).map((item, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">{item.referencia}</TableCell>
                    <TableCell className="text-right">{item.cantidad.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
                {data.length > 10 && (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center text-muted-foreground">
                      ... y {data.length - 10} referencias más
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            
            <div className="mt-4">
              <Button onClick={onNext} className="w-full">
                Continuar a Validación de Componentes
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};