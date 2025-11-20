import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle } from "lucide-react";

interface ComparisonReportItem {
  reference: string;
  required: number;
  csvQuantity: number;
  csvProduction: number;
  currentQuantity: number;
  difference: number;
  status: 'Cumple' | 'Insuficiente';
  comboUsed: string;
}

interface ComboComparisonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  report: ComparisonReportItem[];
}

export const ComboComparisonDialog: React.FC<ComboComparisonDialogProps> = ({
  open,
  onOpenChange,
  report,
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reporte de Comparación CSV</DialogTitle>
          <DialogDescription>
            Comparación entre cantidades del CSV y requerimientos actuales
          </DialogDescription>
        </DialogHeader>
        
        <div className="mt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Referencia</TableHead>
                <TableHead>Combo Usado</TableHead>
                <TableHead className="text-right">Requerido</TableHead>
                <TableHead className="text-right">Cantidad CSV</TableHead>
                <TableHead className="text-right">Producción CSV</TableHead>
                <TableHead className="text-right">Diferencia</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.map((item, index) => (
                <TableRow key={index}>
                  <TableCell className="font-medium">{item.reference}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{item.comboUsed}</TableCell>
                  <TableCell className="text-right">{item.required}</TableCell>
                  <TableCell className="text-right font-medium">{item.csvQuantity}</TableCell>
                  <TableCell className="text-right">{item.csvProduction}</TableCell>
                  <TableCell className={`text-right font-bold ${item.difference >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {item.difference >= 0 ? '+' : ''}{item.difference}
                  </TableCell>
                  <TableCell>
                    {item.status === 'Cumple' ? (
                      <Badge className="bg-capacity-medium text-capacity-medium-foreground">
                        <CheckCircle2 className="mr-1 h-3 w-3" />
                        Cumple
                      </Badge>
                    ) : (
                      <Badge className="bg-capacity-critical text-capacity-critical-foreground">
                        <XCircle className="mr-1 h-3 w-3" />
                        Insuficiente
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          
          <div className="mt-4 p-4 bg-muted rounded-lg">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Total Referencias:</p>
                <p className="text-2xl font-bold">{report.length}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Cumple Requerimientos:</p>
                <p className="text-2xl font-bold text-green-600">
                  {report.filter(r => r.status === 'Cumple').length}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Insuficientes:</p>
                <p className="text-2xl font-bold text-red-600">
                  {report.filter(r => r.status === 'Insuficiente').length}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Diferencia Total:</p>
                <p className={`text-2xl font-bold ${report.reduce((sum, r) => sum + r.difference, 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {report.reduce((sum, r) => sum + r.difference, 0) >= 0 ? '+' : ''}
                  {report.reduce((sum, r) => sum + r.difference, 0)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
