import React, { useState, useEffect } from "react";
import { 
  ChevronLeft, 
  ChevronRight, 
  Sparkles, 
  CheckCircle2, 
  X, 
  Trophy, 
  Heart, 
  Flame, 
  Compass, 
  ShieldCheck, 
  Star 
} from "lucide-react";

interface TeraIncentiveModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Curiosidade {
  dia: string;
  titulo: string;
  texto: string;
  icon: React.ReactNode;
}

// Pool 1: Fotos locais geradas com IA em alta resolução (Primeiro Dia)
const IMAGES_LOCAL = [
  "/images/tera/tera-1.png",
  "/images/tera/tera-2.png",
  "/images/tera/tera-3.png",
  "/images/tera/tera-4.png",
  "/images/tera/tera-5.png",
];

// Pool 2: Fotos reais do VW Tera na internet (A partir do Segundo Dia)
const IMAGES_INTERNET = [
  "https://cdn.motor1.com/images/mgl/RqKqZw/s1/volkswagen-tera-ao-vivo-no-sambodromo-15.jpg",
  "https://fotos.jornaldocarro.estadao.com.br/wp-content/uploads/2024/11/05111956/volkswagen-tera.jpg",
  "https://images.noticiasautomotivas.com.br/img/c/volkswagen-tera-visual.jpg",
  "https://cdn.motor1.com/images/mgl/y2X8xO/s1/volkswagen-tera-painel-interior.jpg",
  "https://images.noticiasautomotivas.com.br/img/c/volkswagen-tera-traseira.jpg",
];

const CURIOSIDADES: Curiosidade[] = [
  {
    dia: "Domingo",
    titulo: "Estilo Próprio e Exclusivo",
    texto: "O VW Tera permite um estilo único com teto bicolor (pintura contrastante em dois tons) e rodas de liga leve de até 17 polegadas diamantadas. Perfeito para passear no domingo com elegância própria! 🎨🚘",
    icon: <Heart className="w-5 h-5 text-rose-500 animate-pulse" />
  },
  {
    dia: "Segunda-feira",
    titulo: "Design Futurista e Assinatura em LED",
    texto: "O VW Tera traz faróis Full LED super agressivos integrados à nova grade cromada e lanternas traseiras em LED 3D interligadas de ponta a ponta. Comece a semana com o visual do futuro que vai chamar atenção por onde passar! 🚗✨",
    icon: <Sparkles className="w-5 h-5 text-amber-500" />
  },
  {
    dia: "Terça-feira",
    titulo: "A Aclamação do Motor 200 TSI",
    texto: "Equipado com o aclamado motor 1.0 TSI Turbo Flex (128 cv e torque de 20,4 kgfm), o Tera garante arrancadas ágeis no trânsito e uma economia impressionante para rodar a cidade inteira sem se preocupar! ⚡⛽",
    icon: <Flame className="w-5 h-5 text-orange-500" />
  },
  {
    dia: "Quarta-feira",
    titulo: "Cockpit 100% Digital e Conectado",
    texto: "Por dentro, o Tera é pura sofisticação! Ele traz o painel digital Active Info Display de 10.25 polegadas perfeitamente integrado à tela flutuante do VW Play de 10.1 polegadas. Espelhamento sem fio para suas músicas preferidas! 📱🎶",
    icon: <Compass className="w-5 h-5 text-blue-500" />
  },
  {
    dia: "Quinta-feira",
    titulo: "Espaço Inteligente MQB",
    texto: "Construído sobre a consagrada plataforma MQB da Volkswagen, o Tera aproveita cada milímetro interno. Oferece porta-malas generoso e amplo conforto para passageiros. Ideal para planejar a próxima viagem de fim de semana! 🧳🛣️",
    icon: <Trophy className="w-5 h-5 text-yellow-500" />
  },
  {
    dia: "Sexta-feira",
    titulo: "Sistemas Autônomos de Segurança",
    texto: "O VW Tera conta com sistemas inteligentes de ponta, incluindo Frenagem Automática de Emergência (AEB), assistente de permanência em faixa e Controle de Cruzeiro Adaptativo (ACC). Termine a semana com máxima proteção! 🛡️🚦",
    icon: <ShieldCheck className="w-5 h-5 text-emerald-500" />
  },
  {
    dia: "Sábado",
    titulo: "A Força por Trás do Nome 'Tera'",
    texto: "Você sabia? O nome 'Tera' faz alusão à palavra grega 'teras', que significa 'grande' ou 'maravilhoso', além de lembrar 'Terabytes' (alta tecnologia). Um nome forte e moderno para quem sonha grande e realiza! 🌟💪",
    icon: <Star className="w-5 h-5 text-indigo-500 animate-spin-slow" />
  }
];

export const TeraIncentiveModal: React.FC<TeraIncentiveModalProps> = ({ isOpen, onClose }) => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [imagesList, setImagesList] = useState<string[]>(IMAGES_LOCAL);
  const [isUsingInternetImages, setIsUsingInternetImages] = useState(false);
  const [tasksChecked, setTasksChecked] = useState<{ task1: boolean; task2: boolean }>({
    task1: false,
    task2: false,
  });

  const [diaSemana, setDiaSemana] = useState<number>(new Date().getDay());

  useEffect(() => {
    if (isOpen) {
      setDiaSemana(new Date().getDay());
      
      // Lógica de Primeiro Dia Local (Pool 1), Depois Internet (Pool 2)
      const hasSeenFirstDay = localStorage.getItem("tera_has_seen_first_day") === "true";
      if (hasSeenFirstDay) {
        setImagesList(IMAGES_INTERNET);
        setIsUsingInternetImages(true);
      } else {
        setImagesList(IMAGES_LOCAL);
        setIsUsingInternetImages(false);
      }
      
      // Inicia o carrossel em uma foto rotativa correspondente
      setCurrentImageIndex(new Date().getDay() % IMAGES_LOCAL.length);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const curiosidadeDoDia = CURIOSIDADES[diaSemana];

  const handleNextImage = () => {
    setCurrentImageIndex((prev) => (prev + 1) % imagesList.length);
  };

  const handlePrevImage = () => {
    setCurrentImageIndex((prev) => (prev - 1 + imagesList.length) % imagesList.length);
  };

  const toggleTask = (taskKey: 'task1' | 'task2') => {
    setTasksChecked((prev) => ({
      ...prev,
      [taskKey]: !prev[taskKey]
    }));
  };

  // Lógica de fallback para erros de carregamento na imagem da internet
  const handleImageError = () => {
    console.warn(`Erro ao carregar imagem no índice ${currentImageIndex}. Aplicando fallback local.`);
    setImagesList((prevList) => {
      const newList = [...prevList];
      // Substitui o link quebrado pela imagem local equivalente
      newList[currentImageIndex] = IMAGES_LOCAL[currentImageIndex % IMAGES_LOCAL.length];
      return newList;
    });
  };

  const handleClose = () => {
    // Grava que o primeiro dia local já foi visto ao fechar o modal
    localStorage.setItem("tera_has_seen_first_day", "true");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md transition-all duration-300 animate-fade-in">
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl overflow-hidden shadow-2xl border border-slate-100 dark:border-slate-800 transition-colors duration-300 max-h-[90vh] flex flex-col">
        
        {/* Top Gradient bar */}
        <div className="h-2 w-full bg-gradient-to-r from-red-500 via-amber-500 to-orange-500" />
        
        {/* Close Button */}
        <button 
          onClick={handleClose}
          className="absolute top-4 right-4 z-10 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-all active:scale-95"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Content Container (Scrollable internally) */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 custom-scrollbar">
          
          {/* Header */}
          <div className="text-center space-y-1.5 mt-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 rounded-full text-xs font-black uppercase tracking-wider animate-bounce">
              <Sparkles className="w-3.5 h-3.5" /> Foco no Objetivo
            </div>
            <h2 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-slate-50 tracking-tight leading-tight">
              Bom dia, <span className="bg-gradient-to-r from-red-600 to-orange-500 bg-clip-text text-transparent">Nayane</span>! 🚗💨
            </h2>
            <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 font-medium">
              O seu **VW Tera** dos sonhos está cada vez mais perto. Vamos acelerar rumo a essa conquista!
            </p>
          </div>

          {/* Carrossel de Imagens */}
          <div className="relative group w-full h-[220px] md:h-[280px] bg-slate-100 dark:bg-slate-950 rounded-2xl overflow-hidden shadow-inner border border-slate-100 dark:border-slate-800">
            <img 
              src={imagesList[currentImageIndex]} 
              alt="Volkswagen Tera"
              onError={handleImageError}
              className="w-full h-full object-cover transition-all duration-700 ease-in-out transform hover:scale-105"
            />
            
            {/* Dark gradient overlay for UI details */}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-transparent pointer-events-none" />

            {/* Setas de Navegação */}
            <button 
              onClick={handlePrevImage}
              className="absolute left-3 top-1/2 -translate-y-1/2 p-2 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm text-slate-800 dark:text-slate-200 rounded-full shadow-md transition-all hover:bg-white dark:hover:bg-slate-900 active:scale-90 hover:scale-105"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button 
              onClick={handleNextImage}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm text-slate-800 dark:text-slate-200 rounded-full shadow-md transition-all hover:bg-white dark:hover:bg-slate-900 active:scale-90 hover:scale-105"
            >
              <ChevronRight className="w-5 h-5" />
            </button>

            {/* Indicadores Bolinhas */}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5">
              {imagesList.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentImageIndex(index)}
                  className={`h-2 rounded-full transition-all duration-300 ${index === currentImageIndex ? "w-6 bg-red-600" : "w-2 bg-white/60 hover:bg-white"}`}
                />
              ))}
            </div>

            {/* Image Source Badge */}
            <div className="absolute top-3 left-3 text-[9px] font-black uppercase tracking-wider text-white bg-slate-900/50 px-2 py-0.5 rounded-full backdrop-blur-sm">
              {isUsingInternetImages ? "Real da Internet 🌐" : "Premium IA 🎨"}
            </div>

            {/* Image caption */}
            <div className="absolute bottom-3 right-4 text-[10px] md:text-xs font-bold text-white/90 bg-slate-900/40 px-2 py-0.5 rounded-full backdrop-blur-sm">
              Foto {currentImageIndex + 1} de {imagesList.length}
            </div>
          </div>

          {/* Curiosidade do Dia */}
          <div className="p-4 bg-gradient-to-r from-red-50 to-orange-50 dark:from-slate-800/40 dark:to-slate-800/20 rounded-2xl border border-red-100/50 dark:border-slate-800 flex items-start gap-4">
            <div className="p-2.5 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-red-50 dark:border-slate-700/50 flex-shrink-0">
              {curiosidadeDoDia.icon}
            </div>
            <div className="space-y-1">
              <span className="text-[10px] font-black text-red-600 dark:text-red-400 uppercase tracking-widest block leading-none">Curiosidade de {curiosidadeDoDia.dia}</span>
              <h4 className="text-sm font-black text-slate-900 dark:text-slate-100 tracking-tight">{curiosidadeDoDia.titulo}</h4>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
                {curiosidadeDoDia.texto}
              </p>
            </div>
          </div>

          {/* Regras de Ouro do Dia (Checklist) */}
          <div className="space-y-3">
            <h4 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Regras de Ouro de Hoje</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              
              {/* Task 1 */}
              <button 
                onClick={() => toggleTask('task1')}
                className={`flex items-center gap-3.5 p-4 rounded-2xl border text-left transition-all active:scale-[0.98] ${
                  tasksChecked.task1 
                    ? 'bg-emerald-50/50 border-emerald-200 dark:bg-emerald-950/10 dark:border-emerald-900/30' 
                    : 'bg-slate-50 border-slate-100 dark:bg-slate-850/30 dark:border-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800/30'
                }`}
              >
                <div className={`p-1.5 rounded-lg border transition-colors ${
                  tasksChecked.task1 
                    ? 'bg-emerald-500 border-emerald-500 text-white' 
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-transparent'
                }`}>
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div className="flex flex-col">
                  <span className={`text-xs font-black tracking-tight ${tasksChecked.task1 ? 'text-emerald-700 dark:text-emerald-400 line-through' : 'text-slate-800 dark:text-slate-200'}`}>
                    Lançar Pedidos no Sistema
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium">Registrar todas as compras do dia 🛒</span>
                </div>
              </button>

              {/* Task 2 */}
              <button 
                onClick={() => toggleTask('task2')}
                className={`flex items-center gap-3.5 p-4 rounded-2xl border text-left transition-all active:scale-[0.98] ${
                  tasksChecked.task2 
                    ? 'bg-emerald-50/50 border-emerald-200 dark:bg-emerald-950/10 dark:border-emerald-900/30' 
                    : 'bg-slate-50 border-slate-100 dark:bg-slate-850/30 dark:border-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800/30'
                }`}
              >
                <div className={`p-1.5 rounded-lg border transition-colors ${
                  tasksChecked.task2 
                    ? 'bg-emerald-500 border-emerald-500 text-white' 
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-transparent'
                }`}>
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div className="flex flex-col">
                  <span className={`text-xs font-black tracking-tight ${tasksChecked.task2 ? 'text-emerald-700 dark:text-emerald-400 line-through' : 'text-slate-800 dark:text-slate-200'}`}>
                    Vigiar Orçamento de Compra
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium">Não estourar os limites mensais 📊</span>
                </div>
              </button>

            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex flex-col sm:flex-row items-center gap-4 justify-between">
          <div className="flex items-center gap-1.5 text-slate-400 dark:text-slate-500">
            <Flame className="w-4 h-4 text-orange-500" />
            <span className="text-[10px] font-black uppercase tracking-wider">A conquista de amanhã depende do esforço de hoje!</span>
          </div>
          <button 
            onClick={handleClose}
            className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-red-600 via-orange-500 to-amber-500 text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-lg shadow-orange-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all hover:shadow-orange-500/35 cursor-pointer"
          >
            Bora conquistar o dia! 💪
          </button>
        </div>

      </div>
    </div>
  );
};
