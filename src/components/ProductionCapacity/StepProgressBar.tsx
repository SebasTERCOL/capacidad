import React from 'react';
import { Check } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';

interface StepInfo {
  id: number;
  title: string;
  description: string;
}

interface StepProgressBarProps {
  steps: StepInfo[];
  currentStep: number;
}

const StepProgressBar: React.FC<StepProgressBarProps> = ({ steps, currentStep }) => {
  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex items-center w-full py-2">
        {steps.map((step, index) => (
          <React.Fragment key={step.id}>
            {/* Step circle */}
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className={`stepper-circle border-2 ${
                    currentStep > step.id
                      ? 'bg-primary border-primary text-primary-foreground'
                      : currentStep === step.id
                        ? 'bg-primary border-primary text-primary-foreground ring-4 ring-primary/20 scale-110'
                        : 'bg-muted border-border text-muted-foreground'
                  }`}
                >
                  {currentStep > step.id ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    step.id
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-center">
                <p className="font-semibold text-xs">{step.title}</p>
                <p className="text-xs text-muted-foreground">{step.description}</p>
              </TooltipContent>
            </Tooltip>

            {/* Connector line */}
            {index < steps.length - 1 && (
              <div
                className={`stepper-line ${
                  currentStep > step.id ? 'bg-primary' : 'bg-border'
                }`}
              />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Current step label */}
      <div className="text-center mt-1">
        <span className="text-sm font-semibold text-foreground">
          {steps.find(s => s.id === currentStep)?.title}
        </span>
        <span className="text-xs text-muted-foreground ml-2">
          — {steps.find(s => s.id === currentStep)?.description}
        </span>
      </div>
    </TooltipProvider>
  );
};

export default StepProgressBar;
