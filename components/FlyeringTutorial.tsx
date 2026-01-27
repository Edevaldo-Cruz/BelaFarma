import React, { useState, useEffect } from 'react';
import { X, ChevronRight, ChevronLeft, Check } from 'lucide-react';

interface TutorialStep {
  title: string;
  description: string;
  image?: string;
  position: 'center' | 'top-right' | 'top-left';
}

const tutorialSteps: TutorialStep[] = [
  {
    title: '🎉 Bem-vindo à Panfletagem!',
    description: 'Aqui você pode distribuir tarefas de panfletagem usando um mapa interativo. Vamos fazer um tour rápido?',
    position: 'center',
  },
  {
    title: '🗺️ Ferramentas de Desenho',
    description: 'No canto superior direito, você encontra as ferramentas para desenhar:\n\n📏 **Linha** - Para marcar ruas\n⬛ **Polígono** - Para marcar quarteirões\n\nApenas administradores podem desenhar.',
    position: 'top-right',
  },
  {
    title: '✏️ Como Desenhar uma Rua',
    description: '1. Clique no botão de linha (📏)\n2. Clique no mapa para marcar pontos\n3. Siga o caminho da rua\n4. Clique duas vezes para finalizar\n\nUm modal aparecerá para você escolher o usuário!',
    position: 'center',
  },
  {
    title: '🎨 Cores Automáticas',
    description: 'Cada usuário tem uma cor única gerada automaticamente!\n\nTodas as áreas do mesmo usuário terão a mesma cor, facilitando a visualização.',
    position: 'center',
  },
  {
    title: '📊 Legenda',
    description: 'No canto superior direito aparece a legenda com:\n\n• Lista de usuários e suas cores\n• Contagem de tarefas por status\n• Clique para filtrar áreas de um usuário\n• Atualize status diretamente',
    position: 'top-right',
  },
  {
    title: '✅ Pronto para Começar!',
    description: 'Agora você já sabe como usar o sistema de panfletagem!\n\nComece desenhando sua primeira área no mapa. 🚀',
    position: 'center',
  },
];

interface FlyeringTutorialProps {
  onClose: () => void;
}

export const FlyeringTutorial: React.FC<FlyeringTutorialProps> = ({ onClose }) => {
  const [currentStep, setCurrentStep] = useState(0);

  const handleNext = () => {
    if (currentStep < tutorialSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onClose();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    onClose();
  };

  const step = tutorialSteps[currentStep];
  const isLastStep = currentStep === tutorialSteps.length - 1;

  const positionClasses = {
    center: 'top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2',
    'top-right': 'top-20 right-4',
    'top-left': 'top-20 left-4',
  };

  return (
    <>
      {/* Overlay escuro */}
      <div className="fixed inset-0 bg-black bg-opacity-50 z-[1000] backdrop-blur-sm" onClick={handleSkip} />

      {/* Tutorial Card */}
      <div
        className={`fixed ${positionClasses[step.position]} z-[1001] bg-white rounded-2xl shadow-2xl p-6 max-w-md border-2 border-blue-500 animate-fadeIn`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <h3 className="text-xl font-black text-slate-900">{step.title}</h3>
          <button
            onClick={handleSkip}
            className="p-1 hover:bg-slate-100 rounded-lg transition-colors text-slate-400 hover:text-slate-600"
            title="Pular tutorial"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Description */}
        <div className="mb-6">
          <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">
            {step.description}
          </p>
        </div>

        {/* Progress Dots */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {tutorialSteps.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentStep(index)}
              className={`w-2 h-2 rounded-full transition-all ${
                index === currentStep
                  ? 'bg-blue-600 w-6'
                  : index < currentStep
                  ? 'bg-green-500'
                  : 'bg-slate-300'
              }`}
              title={`Passo ${index + 1}`}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={handlePrevious}
            disabled={currentStep === 0}
            className="px-4 py-2 rounded-lg font-bold text-sm transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-100 text-slate-700 flex items-center gap-2"
          >
            <ChevronLeft className="w-4 h-4" />
            Anterior
          </button>

          <span className="text-xs font-bold text-slate-500">
            {currentStep + 1} de {tutorialSteps.length}
          </span>

          <button
            onClick={handleNext}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-sm transition-colors flex items-center gap-2"
          >
            {isLastStep ? (
              <>
                Começar <Check className="w-4 h-4" />
              </>
            ) : (
              <>
                Próximo <ChevronRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>

        {/* Skip option */}
        {!isLastStep && (
          <div className="text-center mt-4">
            <button
              onClick={handleSkip}
              className="text-xs text-slate-500 hover:text-slate-700 underline font-bold"
            >
              Pular tutorial
            </button>
          </div>
        )}
      </div>
    </>
  );
};
