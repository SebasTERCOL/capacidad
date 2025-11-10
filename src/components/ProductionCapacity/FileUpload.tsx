import React, { useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, FileSpreadsheet, Trash2 } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { Switch } from "@/components/ui/switch";

export interface ProductionRequest {
  referencia: string;
  cantidad: number;
}

export interface FileUploadData {
  ptData: ProductionRequest[];
  ppData: ProductionRequest[];
  combinedData: ProductionRequest[];
}

interface FileUploadProps {
  onDataProcessed: (data: FileUploadData) => void;
  onNext: () => void;
  onInventoryToggle: (useInventory: boolean) => void;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onDataProcessed, onNext, onInventoryToggle }) => {
  const [ptFile, setPtFile] = useState<File | null>(null);
  const [ppFile, setPpFile] = useState<File | null>(null);
  const [ptData, setPtData] = useState<ProductionRequest[]>([]);
  const [ppData, setPpData] = useState<ProductionRequest[]>([]);
  const [combinedData, setCombinedData] = useState<ProductionRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [useInventory, setUseInventory] = useState(true);

  const detectSeparator = (content: string): string => {
    const firstLine = content.split(/\r?\n/)[0];
    if (firstLine.includes(';')) return ';';
    if (firstLine.includes(',')) return ',';
    return ','; // default
  };

  const parseCSVLine = (line: string, separator: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];
      
      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          current += '"';
          i++; // Skip next quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === separator && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    result.push(current.trim());
    return result;
  };

  const parseCSV = (content: string): ProductionRequest[] => {
    console.log('Contenido del archivo:', content.substring(0, 200) + '...');
    
    const separator = detectSeparator(content);
    console.log('Separador detectado:', separator);
    
    const lines = content.split(/\r?\n/).filter(line => line.trim());
    if (lines.length < 1) {
      throw new Error('El archivo está vacío');
    }
    
    // If no headers are detected, assume first two columns are referencia and cantidad
    const firstLine = parseCSVLine(lines[0], separator);
    let headers: string[];
    let dataStartIndex = 0;
    
    // Check if first line looks like headers or data
    const firstColLooksLikeHeader = isNaN(parseFloat(firstLine[0])) && 
      (firstLine[0].toLowerCase().includes('ref') || 
       firstLine[0].toLowerCase().includes('codigo') ||
       firstLine[0].toLowerCase() === 'referencia');
    
    if (firstColLooksLikeHeader && firstLine.length >= 2) {
      headers = firstLine.map(h => h.trim().toLowerCase().replace(/["']/g, ''));
      dataStartIndex = 1;
    } else {
      // No headers, assume first column is referencia, second is cantidad
      headers = ['referencia', 'cantidad'];
      dataStartIndex = 0;
    }
    
    console.log('Encabezados detectados:', headers);
    
    const refIndex = headers.findIndex(h => 
      h.includes('referencia') || 
      h.includes('ref') || 
      h.includes('codigo') || 
      h.includes('code') ||
      h === 'referencia' ||
      h === 'ref'
    );
    
    const quantityIndex = headers.findIndex(h => 
      h.includes('cantidad') || 
      h.includes('qty') || 
      h.includes('quantity') ||
      h.includes('cant') ||
      h === 'cantidad' ||
      h === 'qty'
    );
    
    // If no headers found, assume first two columns
    const finalRefIndex = refIndex !== -1 ? refIndex : 0;
    const finalQuantityIndex = quantityIndex !== -1 ? quantityIndex : 1;
    
    console.log('Índices encontrados - Referencia:', finalRefIndex, 'Cantidad:', finalQuantityIndex);
    
    if (lines.length <= dataStartIndex) {
      throw new Error('No hay datos para procesar en el archivo');
    }
    
    const parsed = lines.slice(dataStartIndex).map((line, index) => {
      try {
        const values = parseCSVLine(line, separator);
        if (values.length < 2) {
          console.warn(`Línea ${index + dataStartIndex + 1} no tiene suficientes columnas:`, line);
          return null;
        }
        
        const referencia = values[finalRefIndex]?.trim().replace(/["']/g, '') || '';
        const cantidadStr = values[finalQuantityIndex]?.trim().replace(/["']/g, '') || '0';
        const cantidad = parseFloat(cantidadStr.replace(/[,]/g, '.')) || 0;
        
        return {
          referencia,
          cantidad
        };
      } catch (error) {
        console.warn(`Error procesando línea ${index + dataStartIndex + 1}:`, line);
        return null;
      }
    }).filter((item): item is ProductionRequest => 
      item !== null && item.referencia !== '' && item.cantidad > 0
    );
    
    console.log('Datos procesados:', parsed);
    return parsed;
  };

  const combineData = (pt: ProductionRequest[], pp: ProductionRequest[]): ProductionRequest[] => {
    const combined = new Map<string, number>();
    
    // Agregar PT
    pt.forEach(item => {
      combined.set(item.referencia, (combined.get(item.referencia) || 0) + item.cantidad);
    });
    
    // Agregar PP (sumando si ya existe)
    pp.forEach(item => {
      combined.set(item.referencia, (combined.get(item.referencia) || 0) + item.cantidad);
    });
    
    return Array.from(combined.entries()).map(([referencia, cantidad]) => ({
      referencia,
      cantidad
    }));
  };

  const handlePtFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0] || null;
    setPtFile(selectedFile);
    if (!selectedFile) {
      setPtData([]);
      setCombinedData([]);
    }
  }, []);

  const handlePpFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0] || null;
    setPpFile(selectedFile);
    if (!selectedFile) {
      setPpData([]);
    }
  }, []);

  const processFiles = async () => {
    if (!ptFile) {
      toast.error("Error", {
        description: "Debe cargar al menos el archivo de Productos Terminados (PT)",
      });
      return;
    }
    
    setLoading(true);
    try {
      // Procesar archivo PT (obligatorio)
      const contentPt = await ptFile.text();
      const parsedPt = parseCSV(contentPt);
      
      if (parsedPt.length === 0) {
        throw new Error('No se encontraron datos válidos en el archivo PT');
      }
      
      // Procesar archivo PP (opcional)
      let parsedPp: ProductionRequest[] = [];
      if (ppFile) {
        const contentPp = await ppFile.text();
        parsedPp = parseCSV(contentPp);
      }
      
      // Combinar datos
      const combined = combineData(parsedPt, parsedPp);
      
      setPtData(parsedPt);
      setPpData(parsedPp);
      setCombinedData(combined);
      
      onDataProcessed({
        ptData: parsedPt,
        ppData: parsedPp,
        combinedData: combined
      });
      
      toast.success("Archivos procesados", {
        description: `PT: ${parsedPt.length} refs, PP: ${parsedPp.length} refs, Total único: ${combined.length} refs`,
      });
    } catch (error) {
      toast.error("Error al procesar archivos", {
        description: error instanceof Error ? error.message : "Error desconocido",
      });
    }
    setLoading(false);
  };

  const clearData = () => {
    setPtFile(null);
    setPpFile(null);
    setPtData([]);
    setPpData([]);
    setCombinedData([]);
    onDataProcessed({
      ptData: [],
      ppData: [],
      combinedData: []
    });
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
          {/* Archivo PT */}
          <div className="space-y-2">
            <Label htmlFor="pt-file-upload" className="font-semibold">
              Archivo PT (Productos Terminados) *
            </Label>
            <Input
              id="pt-file-upload"
              type="file"
              accept=".csv"
              onChange={handlePtFileChange}
              className="cursor-pointer"
            />
            <p className="text-sm text-muted-foreground">
              Archivo principal con productos finales. Este hará el desglose BOM completo.
            </p>
          </div>
          
          {/* Archivo PP */}
          <div className="space-y-2">
            <Label htmlFor="pp-file-upload" className="font-semibold">
              Archivo PP (Productos en Proceso) - Opcional
            </Label>
            <Input
              id="pp-file-upload"
              type="file"
              accept=".csv"
              onChange={handlePpFileChange}
              className="cursor-pointer"
            />
            <p className="text-sm text-muted-foreground">
              Insumos adicionales que se suman a lo requerido por el PT.
            </p>
          </div>

          <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/50">
            <div className="space-y-1">
              <Label htmlFor="inventory-toggle" className="text-sm font-medium">
                Calcular con Inventario Disponible
              </Label>
              <p className="text-xs text-muted-foreground">
                Cuando está activo, se resta el inventario disponible para calcular la producción necesaria
              </p>
            </div>
            <Switch
              id="inventory-toggle"
              checked={useInventory}
              onCheckedChange={(checked) => {
                setUseInventory(checked);
                onInventoryToggle(checked);
              }}
            />
          </div>
          
          <div className="flex gap-2">
            <Button 
              onClick={processFiles} 
              disabled={!ptFile || loading}
              className="flex items-center gap-2"
            >
              <FileSpreadsheet className="h-4 w-4" />
              {loading ? 'Procesando...' : 'Procesar Archivos'}
            </Button>
            
            {combinedData.length > 0 && (
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

      {combinedData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Datos Cargados</CardTitle>
            <CardDescription>
              {ptData.length > 0 && <div>PT: {ptData.length} referencias</div>}
              {ppData.length > 0 && <div>PP: {ppData.length} referencias</div>}
              <div className="font-semibold">Total único: {combinedData.length} referencias</div>
            </CardDescription>
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
                {combinedData.slice(0, 10).map((item, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">{item.referencia}</TableCell>
                    <TableCell className="text-right">{item.cantidad.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
                {combinedData.length > 10 && (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center text-muted-foreground">
                      ... y {combinedData.length - 10} referencias más
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