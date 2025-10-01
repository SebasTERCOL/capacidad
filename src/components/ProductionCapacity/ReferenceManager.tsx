import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Settings, Search, Plus, Pencil, Trash2, ChevronLeft, ChevronRight, Save, X, Filter } from "lucide-react";
import { toast } from "sonner";

interface MachineProcess {
  id: number;
  id_machine: number;
  id_process: number;
  ref: string;
  frequency: number;
  sam: number;
  machine_name?: string;
  process_name?: string;
}

interface Process {
  id: number;
  name: string;
}

interface Machine {
  id: number;
  name: string;
}

interface ReferenceManagerProps {
  onClose?: () => void;
}

export const ReferenceManager: React.FC<ReferenceManagerProps> = ({ onClose }) => {
  const [references, setReferences] = useState<MachineProcess[]>([]);
  const [processes, setProcesses] = useState<Process[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [filteredMachines, setFilteredMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProcess, setSelectedProcess] = useState<string>('all');
  const [selectedMachine, setSelectedMachine] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<{ sam: number; frequency: number }>({ sam: 0, frequency: 0 });
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newReference, setNewReference] = useState({
    ref: '',
    id_process: '',
    id_machine: '',
    sam: 0,
    frequency: 0
  });

  const itemsPerPage = 50;

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    // Filtrar máquinas basadas en el proceso seleccionado
    if (selectedProcess === 'all') {
      setFilteredMachines(machines);
    } else {
      const processId = parseInt(selectedProcess);
      const machinesForProcess = references
        .filter(ref => ref.id_process === processId)
        .map(ref => machines.find(m => m.id === ref.id_machine))
        .filter((m, index, self) => m && self.findIndex(t => t?.id === m.id) === index) as Machine[];
      setFilteredMachines(machinesForProcess);
    }
  }, [selectedProcess, machines, references]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Cargar procesos
      const { data: processesData, error: processesError } = await supabase
        .from('processes')
        .select('*')
        .order('name');
      
      if (processesError) throw processesError;
      setProcesses(processesData || []);

      // Cargar máquinas
      const { data: machinesData, error: machinesError } = await supabase
        .from('machines')
        .select('*')
        .order('name');
      
      if (machinesError) throw machinesError;
      setMachines(machinesData || []);

      // Cargar referencias (sin límite para obtener todos los registros)
      const { data: referencesData, error: referencesError } = await supabase
        .from('machines_processes')
        .select('*', { count: 'exact' })
        .order('ref')
        .limit(10000);
      
      if (referencesError) throw referencesError;

      // Enriquecer datos con nombres
      const enrichedReferences = (referencesData || []).map(ref => ({
        ...ref,
        machine_name: machinesData?.find(m => m.id === ref.id_machine)?.name || 'Desconocida',
        process_name: processesData?.find(p => p.id === ref.id_process)?.name || 'Desconocido'
      }));

      setReferences(enrichedReferences);
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Error al cargar los datos');
    } finally {
      setLoading(false);
    }
  };

  const filteredReferences = references.filter(ref => {
    const matchesSearch = ref.ref.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesProcess = selectedProcess === 'all' || ref.id_process === parseInt(selectedProcess);
    const matchesMachine = selectedMachine === 'all' || ref.id_machine === parseInt(selectedMachine);
    return matchesSearch && matchesProcess && matchesMachine;
  });

  const totalPages = Math.ceil(filteredReferences.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedReferences = filteredReferences.slice(startIndex, startIndex + itemsPerPage);

  const handleEdit = (ref: MachineProcess) => {
    setEditingId(ref.id);
    setEditValues({ sam: ref.sam, frequency: ref.frequency });
  };

  const handleSave = async (id: number) => {
    try {
      const { error } = await supabase
        .from('machines_processes')
        .update({
          sam: editValues.sam,
          frequency: editValues.frequency
        })
        .eq('id', id);

      if (error) throw error;

      toast.success('Referencia actualizada correctamente');
      setEditingId(null);
      loadData();
    } catch (error) {
      console.error('Error updating reference:', error);
      toast.error('Error al actualizar la referencia');
    }
  };

  const handleMachineChange = async (refId: number, newMachineId: string) => {
    try {
      const { error } = await supabase
        .from('machines_processes')
        .update({ id_machine: parseInt(newMachineId) })
        .eq('id', refId);

      if (error) throw error;

      toast.success('Máquina actualizada correctamente');
      loadData();
    } catch (error) {
      console.error('Error updating machine:', error);
      toast.error('Error al actualizar la máquina');
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;

    try {
      const { error } = await supabase
        .from('machines_processes')
        .delete()
        .eq('id', deleteId);

      if (error) throw error;

      toast.success('Referencia eliminada correctamente');
      setDeleteId(null);
      loadData();
    } catch (error) {
      console.error('Error deleting reference:', error);
      toast.error('Error al eliminar la referencia');
    }
  };

  const handleAdd = async () => {
    if (!newReference.ref || !newReference.id_process || !newReference.id_machine) {
      toast.error('Por favor complete todos los campos obligatorios');
      return;
    }

    try {
      const { error } = await supabase
        .from('machines_processes')
        .insert({
          ref: newReference.ref,
          id_process: parseInt(newReference.id_process),
          id_machine: parseInt(newReference.id_machine),
          sam: newReference.sam,
          frequency: newReference.frequency
        });

      if (error) throw error;

      toast.success('Referencia agregada correctamente');
      setIsAddDialogOpen(false);
      setNewReference({ ref: '', id_process: '', id_machine: '', sam: 0, frequency: 0 });
      loadData();
    } catch (error) {
      console.error('Error adding reference:', error);
      toast.error('Error al agregar la referencia');
    }
  };

  const resetFilters = () => {
    setSearchTerm('');
    setSelectedProcess('all');
    setSelectedMachine('all');
    setCurrentPage(1);
  };

  if (loading) {
    return (
      <Card className="w-full">
        <CardContent className="p-12">
          <div className="flex items-center justify-center">
            <div className="text-muted-foreground">Cargando referencias...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Gestión de Referencias
            </CardTitle>
            <CardDescription>
              Administrar referencias de máquinas y procesos ({filteredReferences.length} registros)
            </CardDescription>
          </div>
          {onClose && (
            <Button variant="ghost" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Filtros y Búsqueda */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label htmlFor="search">
              <Search className="h-4 w-4 inline mr-2" />
              Buscar Referencia
            </Label>
            <Input
              id="search"
              placeholder="Buscar por referencia..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="process-filter">Filtrar por Proceso</Label>
            <Select value={selectedProcess} onValueChange={(value) => {
              setSelectedProcess(value);
              setSelectedMachine('all');
              setCurrentPage(1);
            }}>
              <SelectTrigger id="process-filter">
                <SelectValue placeholder="Todos los procesos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los procesos</SelectItem>
                {processes.map(process => (
                  <SelectItem key={process.id} value={process.id.toString()}>
                    {process.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="machine-filter">Filtrar por Máquina</Label>
            <Select value={selectedMachine} onValueChange={(value) => {
              setSelectedMachine(value);
              setCurrentPage(1);
            }}>
              <SelectTrigger id="machine-filter">
                <SelectValue placeholder="Todas las máquinas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las máquinas</SelectItem>
                {filteredMachines.map(machine => (
                  <SelectItem key={machine.id} value={machine.id.toString()}>
                    {machine.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 flex flex-col justify-end gap-2">
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button className="w-full">
                  <Plus className="h-4 w-4 mr-2" />
                  Agregar Referencia
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Agregar Nueva Referencia</DialogTitle>
                  <DialogDescription>
                    Complete los datos para agregar una nueva referencia
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="new-ref">Referencia *</Label>
                    <Input
                      id="new-ref"
                      placeholder="Ej: REF-001"
                      value={newReference.ref}
                      onChange={(e) => setNewReference({ ...newReference, ref: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-process">Proceso *</Label>
                    <Select 
                      value={newReference.id_process} 
                      onValueChange={(value) => {
                        setNewReference({ ...newReference, id_process: value, id_machine: '' });
                      }}
                    >
                      <SelectTrigger id="new-process">
                        <SelectValue placeholder="Seleccionar proceso" />
                      </SelectTrigger>
                      <SelectContent>
                        {processes.map(process => (
                          <SelectItem key={process.id} value={process.id.toString()}>
                            {process.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-machine">Máquina *</Label>
                    <Select 
                      value={newReference.id_machine} 
                      onValueChange={(value) => setNewReference({ ...newReference, id_machine: value })}
                      disabled={!newReference.id_process}
                    >
                      <SelectTrigger id="new-machine">
                        <SelectValue placeholder="Seleccionar máquina" />
                      </SelectTrigger>
                      <SelectContent>
                        {machines
                          .filter(m => references.some(r => 
                            r.id_machine === m.id && 
                            r.id_process === parseInt(newReference.id_process)
                          ))
                          .map(machine => (
                            <SelectItem key={machine.id} value={machine.id.toString()}>
                              {machine.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="new-sam">SAM</Label>
                      <Input
                        id="new-sam"
                        type="number"
                        step="0.01"
                        value={newReference.sam}
                        onChange={(e) => setNewReference({ ...newReference, sam: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="new-frequency">Frecuencia</Label>
                      <Input
                        id="new-frequency"
                        type="number"
                        value={newReference.frequency}
                        onChange={(e) => setNewReference({ ...newReference, frequency: parseInt(e.target.value) || 0 })}
                      />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={handleAdd}>
                    <Plus className="h-4 w-4 mr-2" />
                    Agregar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Button variant="outline" onClick={resetFilters} size="sm">
              <Filter className="h-4 w-4 mr-2" />
              Limpiar Filtros
            </Button>
          </div>
        </div>

        {/* Tabla de Referencias */}
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Referencia</TableHead>
                <TableHead>Proceso</TableHead>
                <TableHead>Máquina</TableHead>
                <TableHead className="text-right">SAM</TableHead>
                <TableHead className="text-right">Frecuencia</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedReferences.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No se encontraron referencias con los filtros aplicados
                  </TableCell>
                </TableRow>
              ) : (
                paginatedReferences.map((ref) => (
                  <TableRow key={ref.id}>
                    <TableCell className="font-medium">{ref.ref}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{ref.process_name}</Badge>
                    </TableCell>
                    <TableCell>
                      {editingId === ref.id ? (
                        <Select 
                          defaultValue={ref.id_machine.toString()}
                          onValueChange={(value) => handleMachineChange(ref.id, value)}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {machines
                              .filter(m => references.some(r => 
                                r.id_machine === m.id && 
                                r.id_process === ref.id_process
                              ))
                              .map(machine => (
                                <SelectItem key={machine.id} value={machine.id.toString()}>
                                  {machine.name}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span>{ref.machine_name}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {editingId === ref.id ? (
                        <Input
                          type="number"
                          step="0.01"
                          value={editValues.sam}
                          onChange={(e) => setEditValues({ ...editValues, sam: parseFloat(e.target.value) || 0 })}
                          className="h-8 w-24 text-right"
                        />
                      ) : (
                        ref.sam.toFixed(2)
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {editingId === ref.id ? (
                        <Input
                          type="number"
                          value={editValues.frequency}
                          onChange={(e) => setEditValues({ ...editValues, frequency: parseInt(e.target.value) || 0 })}
                          className="h-8 w-20 text-right"
                        />
                      ) : (
                        ref.frequency
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {editingId === ref.id ? (
                          <>
                            <Button size="sm" variant="ghost" onClick={() => handleSave(ref.id)}>
                              <Save className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                              <X className="h-4 w-4" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button size="sm" variant="ghost" onClick={() => handleEdit(ref)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button 
                              size="sm" 
                              variant="ghost" 
                              onClick={() => setDeleteId(ref.id)}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Paginación */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Mostrando {startIndex + 1} a {Math.min(startIndex + itemsPerPage, filteredReferences.length)} de {filteredReferences.length} resultados
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="text-sm">
                Página {currentPage} de {totalPages}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>

      {/* Dialog de confirmación de eliminación */}
      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Está seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará permanentemente esta referencia de la base de datos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};