import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Factory, ArrowRight } from "lucide-react";
import { FileUpload, ProductionRequest } from "@/components/ProductionCapacity/FileUpload";
import { OperatorConfiguration, OperatorConfig } from "@/components/ProductionCapacity/OperatorConfiguration";
import { ComponentValidation } from "@/components/ProductionCapacity/ComponentValidation";
import { ProductionProjectionV2 } from "@/components/ProductionCapacity/ProductionProjectionV2";
import { FinalReport } from "@/components/ProductionCapacity/FinalReport";

type Step = 1 | 2 | 3 | 4 | 5;

const Index = () => {
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [productionData, setProductionData] = useState<ProductionRequest[]>([]);
  const [operatorConfig, setOperatorConfig] = useState<OperatorConfig | null>(null);
  const [componentValidation, setComponentValidation] = useState<any[]>([]);
  const [projectionData, setProjectionData] = useState<any[]>([]);

  const steps = [
    { id: 1, title: 'Carga de Archivo', description: 'Subir CSV con referencias' },
    { id: 2, title: 'Configurar Operarios', description: 'Definir personal disponible' },
    { id: 3, title: 'Validación Componentes', description: 'Verificar disponibilidad' },
    { id: 4, title: 'Proyección Producción', description: 'Calcular capacidad real' },
    { id: 5, title: 'Reporte Final', description: 'Resumen consolidado' }
  ];

  const handleDataProcessed = (data: ProductionRequest[]) => {
    setProductionData(data);
  };

  const handleOperatorConfigComplete = (config: OperatorConfig) => {
    setOperatorConfig(config);
  };

  const handleValidationComplete = (validation: any[]) => {
    setComponentValidation(validation);
  };

  const handleProjectionComplete = (projection: any[]) => {
    setProjectionData(projection);
  };

  const handleStartOver = () => {
    setCurrentStep(1);
    setProductionData([]);
    setOperatorConfig(null);
    setComponentValidation([]);
    setProjectionData([]);
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <FileUpload
            onDataProcessed={handleDataProcessed}
            onNext={() => setCurrentStep(2)}
          />
        );
      case 2:
        return (
          <OperatorConfiguration
            onNext={() => setCurrentStep(3)}
            onBack={() => setCurrentStep(1)}
            onConfigComplete={handleOperatorConfigComplete}
          />
        );
      case 3:
        return (
          <ComponentValidation
            data={productionData}
            onNext={() => setCurrentStep(4)}
            onBack={() => setCurrentStep(2)}
            onValidationComplete={handleValidationComplete}
          />
        );
      case 4:
        return operatorConfig ? (
          <ProductionProjectionV2
            data={productionData}
            operatorConfig={operatorConfig}
            onNext={() => setCurrentStep(5)}
            onBack={() => setCurrentStep(3)}
            onProjectionComplete={handleProjectionComplete}
          />
        ) : null;
      case 5:
        return (
          <FinalReport
            productionData={productionData}
            componentValidation={componentValidation}
            projectionData={projectionData}
            onBack={() => setCurrentStep(4)}
            onStartOver={handleStartOver}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-6">
            <Factory className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">Capacidad de Producción</h1>
              <p className="text-muted-foreground">
                Análisis de capacidad y disponibilidad de componentes
              </p>
            </div>
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
    </div>
  );
};

export default Index;