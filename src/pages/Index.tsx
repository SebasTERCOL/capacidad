import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Factory, ArrowRight, ArrowLeft } from "lucide-react";
import { FileUpload, ProductionRequest, FileUploadData } from "@/components/ProductionCapacity/FileUpload";
import { InventoryAdjustment, AdjustedProductionData } from "@/components/ProductionCapacity/InventoryAdjustment";
import { ComboConfiguration, ComboSuggestion } from "@/components/ProductionCapacity/ComboConfiguration";
import { OperatorConfiguration, OperatorConfig } from "@/components/ProductionCapacity/OperatorConfiguration";
import { ProductionProjectionV2 } from "@/components/ProductionCapacity/ProductionProjectionV2";
import { OvertimeConfiguration, DeficitInfo, OvertimeConfig } from "@/components/ProductionCapacity/OvertimeConfiguration";
import ScheduleResults from "@/components/ProductionCapacity/ScheduleResults";

type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7;

const Index = () => {
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [productionData, setProductionData] = useState<ProductionRequest[]>([]);
  const [adjustedData, setAdjustedData] = useState<AdjustedProductionData[]>([]);
  const [comboConfig, setComboConfig] = useState<ComboSuggestion[]>([]);
  const [operatorConfig, setOperatorConfig] = useState<OperatorConfig | null>(null);
  const [projectionData, setProjectionData] = useState<any[]>([]);
  const [deficits, setDeficits] = useState<DeficitInfo[]>([]);
  const [overtimeConfig, setOvertimeConfig] = useState<OvertimeConfig | null>(null);
  const [useInventory, setUseInventory] = useState(true);

  const steps = [
    { id: 1, title: 'Carga de Archivo', description: 'Subir CSV con referencias' },
    { id: 2, title: 'Ajuste de Inventario', description: 'Restar stock disponible' },
    { id: 3, title: 'Configurar Combos', description: 'Optimizar punzonado' },
    { id: 4, title: 'Configurar Operarios', description: 'Definir personal disponible' },
    { id: 5, title: 'Capacidad por Proceso', description: 'Análisis detallado' },
    { id: 6, title: 'Optimizar con Extras', description: 'Configurar horas extras' },
    { id: 7, title: 'Scheduling', description: 'CPM + RCPSP' }
  ];

  const handleDataProcessed = (data: FileUploadData) => {
    setProductionData(data.combinedData);
  };

  const handleAdjustmentComplete = (adjusted: AdjustedProductionData[]) => {
    setAdjustedData(adjusted);
  };

  const handleComboConfigComplete = (combos: ComboSuggestion[]) => {
    setComboConfig(combos);
  };

  const handleOperatorConfigComplete = (config: OperatorConfig) => {
    setOperatorConfig(config);
  };

  const handleProjectionComplete = (projection: any[]) => {
    setProjectionData(projection);
  };

  const handleDeficitsIdentified = (identifiedDeficits: DeficitInfo[]) => {
    setDeficits(identifiedDeficits);
    if (identifiedDeficits.length > 0) {
      setCurrentStep(6); // Ir a configuración de horas extras
    }
  };

  const handleOvertimeApplied = (config: OvertimeConfig) => {
    setOvertimeConfig(config);
    setCurrentStep(5); // Volver a vista de capacidad con extras aplicadas
  };

  const handleStartOver = () => {
    setCurrentStep(1);
    setProductionData([]);
    setAdjustedData([]);
    setComboConfig([]);
    setOperatorConfig(null);
    setProjectionData([]);
    setDeficits([]);
    setOvertimeConfig(null);
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <FileUpload
            onDataProcessed={handleDataProcessed}
            onNext={() => setCurrentStep(2)}
            onInventoryToggle={setUseInventory}
          />
        );
      case 2:
        return (
          <InventoryAdjustment
            data={productionData}
            onNext={() => setCurrentStep(3)}
            onBack={() => setCurrentStep(1)}
            onAdjustmentComplete={handleAdjustmentComplete}
            useInventory={useInventory}
          />
        );
      case 3:
        return (
          <ComboConfiguration
            data={adjustedData.length > 0 ? adjustedData : productionData.map(p => ({ ...p, inventario: 0 }))}
            onNext={() => setCurrentStep(4)}
            onBack={() => setCurrentStep(2)}
            onComboConfigComplete={handleComboConfigComplete}
            useInventory={useInventory}
          />
        );
      case 4:
        return (
          <OperatorConfiguration
            onNext={() => setCurrentStep(5)}
            onBack={() => setCurrentStep(3)}
            onConfigComplete={handleOperatorConfigComplete}
          />
        );
      case 5:
        return operatorConfig ? (
          <ProductionProjectionV2
            data={adjustedData.length > 0 ? adjustedData : productionData}
            originalData={productionData}
            useInventory={useInventory}
            operatorConfig={operatorConfig}
            overtimeConfig={overtimeConfig}
            comboData={comboConfig}
            onNext={() => setCurrentStep(7)}
            onBack={() => setCurrentStep(4)}
            onProjectionComplete={handleProjectionComplete}
            onDeficitsIdentified={handleDeficitsIdentified}
            onStartOver={handleStartOver}
          />
        ) : null;
      case 6:
        return (
          <OvertimeConfiguration
            deficits={deficits}
            workMonth={operatorConfig?.workMonth || new Date().getMonth() + 1}
            workYear={operatorConfig?.workYear || new Date().getFullYear()}
            onBack={() => setCurrentStep(5)}
            onApply={handleOvertimeApplied}
          />
        );
      case 7:
        return operatorConfig ? (
          <ScheduleResults
            data={adjustedData.length > 0 ? adjustedData : productionData}
            operatorConfig={operatorConfig}
            onBack={() => setCurrentStep(5)}
          />
        ) : null;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between gap-3 mb-6">
            <div className="flex items-center gap-3">
              <Factory className="h-8 w-8 text-primary" />
              <div>
                <h1 className="text-2xl font-bold">Capacidad de Producción</h1>
                <p className="text-muted-foreground">
                  Análisis de capacidad y disponibilidad de componentes
                </p>
              </div>
            </div>
            <Link to="/">
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Volver
              </Button>
            </Link>
          </div>

          {/* Progress Steps */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            {steps.map((step, index) => (
              <React.Fragment key={step.id}>
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg whitespace-nowrap ${
                  currentStep === step.id 
                    ? 'bg-primary text-primary-foreground' 
                    : currentStep > step.id 
                      ? 'bg-secondary text-secondary-foreground'
                      : 'bg-muted text-muted-foreground'
                }`}>
                  <Badge variant={currentStep >= step.id ? "default" : "secondary"} className="rounded-full w-6 h-6 p-0 text-xs">
                    {step.id}
                  </Badge>
                  <div className="text-sm">
                    <div className="font-medium">{step.title}</div>
                    <div className="text-xs opacity-80">{step.description}</div>
                  </div>
                </div>
                {index < steps.length - 1 && (
                  <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-6">
        <div className="max-w-6xl mx-auto">
          {renderStepContent()}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t bg-card mt-8">
        <div className="container mx-auto px-4 py-4">
          <div className="text-center text-sm text-muted-foreground">
            <p>Desarrollado por <span className="font-semibold text-foreground">Sebastián Rincón García</span></p>
            <p className="text-xs">Ingeniero de Control y Automatización</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;