import React, { useState, useEffect, useRef, useMemo } from "react";
import { Auth } from "./components/Auth";
import { Sidebar } from "./components/Sidebar";
import { Dashboard } from "./components/Dashboard";
import { Orders } from "./components/Orders";
import { Settings } from "./components/Settings";
import { Financial } from "./components/Financial";
import { Users } from "./components/Users";
import { ProductShortages } from "./components/ProductShortages";
import { MedicationSearch } from "./components/MedicationSearch";
import { CashClosing } from "./components/CashClosing";
import { Safe } from "./components/Safe";
import { DailyRecords } from "./components/DailyRecords";
import { Logs } from "./components/Logs";
import { Quotations } from "./components/Quotations";
import { CheckingAccount } from "./components/CheckingAccount";
import { ContasAPagar } from "./components/ContasAPagar";
import { BoletoBudgetSummaryModal } from "./components/BoletoBudgetSummaryModal";
import { DaysInDebt } from "./components/DaysInDebt";
import { CrediarioReport } from "./components/CrediarioReport";
import { TaskManagementPage } from "./components/TaskManagementPage";
import { FixedAccountsPage } from "./components/FixedAccountsPage";
import { CustomersPage } from "./components/CustomersPage";
import { DebtorsReport } from "./components/DebtorsReport";
import { BackupManager } from "./components/BackupManager";
import { InvoiceList } from "./components/InvoiceList";
import { ConsignadosManager } from "./components/ConsignadosManager";
import { IFoodControl } from "./components/iFoodControl";
import { NotificationsPage } from "./components/NotificationsPage";
import { MessagingCenter } from "./components/MessagingCenter";
import AIPortal from "./components/AIPortal";
import { FinancialHealthAdvisor } from "./components/FinancialHealthAdvisor";
import { CaixaProvisoes } from "./components/CaixaProvisoes";
import { RadioManager } from "./components/RadioManager";
import { WhatsAppCRM } from "./components/WhatsAppCRM";
import { WhatsAppVendas } from "./components/WhatsAppVendas";
import { DeliveriesPage } from "./components/DeliveriesPage";
import { PendingReviewModal } from "./components/PendingReviewModal";
import { TeraIncentiveModal } from "./components/TeraIncentiveModal";
import { EtiquetasManager } from "./components/EtiquetasManager";
import { ComprasLive } from "./components/ComprasLive";
import { PurchaseCalendar } from "./components/PurchaseCalendar";
import { StockManagement } from "./components/StockManagement";
import SuppliersManager from "./components/SuppliersManager";
import { InventoryManager } from "./components/InventoryManager";
import { PwaUpdater } from "./components/PwaUpdater";
import { MobileHeader } from "./components/MobileHeader";
import { SalesReport } from "./components/SalesReport";
import { CriticalStockManager } from "./components/CriticalStockManager";
import { SystemWatcher } from "./components/SystemWatcher";
import { PriceManager } from "./components/PriceManager";
import { AgendaCalendar } from "./components/AgendaCalendar";
import { AnvisaAlerts } from "./components/AnvisaAlerts";
import { NotesManager } from "./components/NotesManager";
import { CardMachinesManager } from "./components/CardMachinesManager";
import { CardMachineReconcileModal } from "./components/CardMachineReconcileModal";
import { MuralModal } from "./components/MuralModal";


import {
  Order,
  View,
  User,
  Task,
  UserRole,
  OrderStatus,
  ProductShortage,
  SystemLog,
  Boleto,
  BoletoStatus,
  MonthlyLimit,
  DailyRecordEntry,
  CashClosingRecord,
  FixedAccount,
  Delivery,
} from "./types";
import { Loader2 } from "lucide-react";
import { useToast } from "./components/ToastContext";
import { trackViewUsage, calculateWeeklyBudgetsCascade } from "./utils";

const LOGOUT_TIME = 15 * 60 * 1000;

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem("belinha_session_user");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Erro ao carregar usuário da sessão", e);
      }
    }
    return null;
  });
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkIfMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkIfMobile();
    window.addEventListener('resize', checkIfMobile);
    return () => window.removeEventListener('resize', checkIfMobile);
  }, []);

  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [orders, setOrders] = useState<Order[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [shortages, setShortages] = useState<ProductShortage[]>([]);
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [boletos, setBoletos] = useState<Boleto[]>([]);
  const [monthlyLimits, setMonthlyLimits] = useState<MonthlyLimit[]>([]);
  const [cashClosings, setCashClosings] = useState<CashClosingRecord[]>([]);
  const [dailyRecords, setDailyRecords] = useState<DailyRecordEntry[]>([]);
  const [fixedAccounts, setFixedAccounts] = useState<FixedAccount[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('belinha_theme');
    return (saved as 'light' | 'dark') || 'light';
  });
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isTeraModalOpen, setIsTeraModalOpen] = useState(false);
  const [isCardMachineModalOpen, setIsCardMachineModalOpen] = useState(false);
  const [isMuralOpen, setIsMuralOpen] = useState(false);
  const [muralPendingCount, setMuralPendingCount] = useState(0);
  const [pendingReviewCount, setPendingReviewCount] = useState(0);
  const [anvisaAlertCount, setAnvisaAlertCount] = useState(0);
  const { addToast } = useToast();
  const [isBudgetSummaryOpen, setIsBudgetSummaryOpen] = useState(true);
  const [showMobileFloatingButton, setShowMobileFloatingButton] = useState(true);
  const [selectedPendingReview, setSelectedPendingReview] = useState<Delivery | null>(null);
  const [pendingReviewMode, setPendingReviewMode] = useState<'pedido' | 'cotacao'>('pedido');
  const [lastReviewedDeliveryId, setLastReviewedDeliveryId] = useState<string | null>(null);

  const handleReviewSubmitted = (deliveryId?: string) => {
    if (deliveryId) {
      setLastReviewedDeliveryId(deliveryId);
    }
    setSelectedPendingReview(null);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowMobileFloatingButton(false);
    }, 10000);
    return () => clearTimeout(timer);
  }, []);

  const handleCloseBudgetSummary = () => {
    setIsBudgetSummaryOpen(false);
  };

  // Cálculos do Orçamento Semanal Atual para o Botão Flutuante e Tema
  const { isBudgetBusted, budgetEmoji, currentMonthBudgetStatus, currentWeekAvailable, currentDailyAvailable } = useMemo(() => {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonthIndex = today.getMonth(); // 0-11

    // Calcula a cascata de orçamentos semanais a partir do primeiro mês com limite cadastrado
    // Usamos o mínimo entre o primeiro ano com limite e o ano atual como ponto de partida
    const earliestYear = monthlyLimits.length > 0
      ? Math.min(...monthlyLimits.map(l => l.year))
      : currentYear;

    const weeklyStats = calculateWeeklyBudgetsCascade(
      boletos,
      monthlyLimits,
      earliestYear,
      currentYear,
      currentMonthIndex
    );

    const currentMonthKey = `${currentYear}-${currentMonthIndex + 1}`;
    const currentMonthStats = weeklyStats[currentMonthKey];

    let overallStatus: 'safe' | 'warning' | 'danger' | 'no-budget' = 'no-budget';
    let emoji = '🤍';
    let isBusted = false;
    let weekAvailable = 0;
    let dailyAvailable = 0;

    if (currentMonthStats) {
      // 1. Calcular Diário
      const daysInMonth = new Date(currentYear, currentMonthIndex + 1, 0).getDate();
      const dailyLimit = currentMonthStats.limit / daysInMonth;
      
      const todayBoletos = boletos.filter(b => {
        if (!b.due_date) return false;
        const [by, bm, bd] = b.due_date.split('-').map(Number);
        return by === today.getFullYear() && bm === (today.getMonth() + 1) && bd === today.getDate();
      });
      const spentToday = todayBoletos.reduce((sum, b) => sum + b.value, 0);
      dailyAvailable = dailyLimit - spentToday;
      
      let percentDaily = 0;
      if (dailyLimit > 0) percentDaily = (spentToday / dailyLimit) * 100;
      else if (spentToday > 0) percentDaily = 100;
      
      let dailyStatusValue: 'safe' | 'warning' | 'danger' = 'safe';
      if (percentDaily >= 100) dailyStatusValue = 'danger';
      else if (percentDaily >= 80) dailyStatusValue = 'warning';

      // 2. Calcular Semanal
      const currentWeek = currentMonthStats.weeks.find(w =>
        today >= w.startDate && today <= w.endDate
      ) || currentMonthStats.weeks[currentMonthStats.weeks.length - 1];

      if (currentWeek) {
        weekAvailable = currentWeek.available;
        const weekStatus = currentWeek.status;
        isBusted = currentWeek.available < 0 || dailyAvailable < 0;
        
        // Pior status entre diário e semanal dita a cor do balão
        overallStatus = weekStatus;
        if (weekStatus === 'danger' || dailyStatusValue === 'danger') overallStatus = 'danger';
        else if (weekStatus === 'warning' || dailyStatusValue === 'warning') overallStatus = 'warning';

        if (overallStatus === 'safe') emoji = '💚';
        else if (overallStatus === 'warning') emoji = '💛';
        else if (overallStatus === 'danger') emoji = '💔';
      }
    }

    return {
      isBudgetBusted: isBusted,
      budgetEmoji: emoji,
      currentMonthBudgetStatus: overallStatus,
      currentWeekAvailable: weekAvailable,
      currentDailyAvailable: dailyAvailable,
    };
  }, [boletos, monthlyLimits]);

  const logoutTimerRef = useRef<number | null>(null);
  const currentViewRef = useRef<View>("dashboard");

  useEffect(() => {
    currentViewRef.current = currentView;
    resetLogoutTimer();
  }, [currentView]);

  const handleLogout = () => {
    setUser(null);
    handleNavigate("dashboard");
    localStorage.removeItem("belinha_session_user");
    if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
  };

  const handleNavigate = (view: View) => {
    setCurrentView(view);
    trackViewUsage(view);
  };

  const resetLogoutTimer = () => {
    if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
    if (isMobile) return; // Se for mobile, não desloga por inatividade
    if (user && currentViewRef.current !== "whatsapp-vendas") {
      logoutTimerRef.current = window.setTimeout(() => {
        handleLogout();
        addToast("Sessão expirada por inatividade.", "warning");
      }, LOGOUT_TIME);
    }
  };

  useEffect(() => {
    if (user) {
      fetchData();
      
      const events = ["mousedown", "keydown", "touchstart"];
      const reset = () => resetLogoutTimer();
      events.forEach((event) => window.addEventListener(event, reset));
      resetLogoutTimer();

      // --- Lógica de Auto-exibição Diária do VW Tera para a Nayane ---
      if (user.name.toLowerCase().includes("nayane") && !isMobile) {
        const hoje = new Date().toISOString().slice(0, 10); // Formato YYYY-MM-DD
        const ultimaDataExibida = localStorage.getItem("tera_popup_last_date");
        if (ultimaDataExibida !== hoje) {
          setIsTeraModalOpen(true);
          localStorage.setItem("tera_popup_last_date", hoje);
        }
      }

      // --- Lógica de Auto-exibição Diária de Conferência de Maquininha após 10h para Edevaldo (Apenas Dias Úteis) ---
      if (user.name.toLowerCase().includes("edevaldo") || user.role === UserRole.ADM) {
        const checkCardMachinePending = async () => {
          try {
            const now = new Date();
            const dayOfWeek = now.getDay(); // 0 = Domingo, 6 = Sábado
            // Não há repasse em finais de semana (Sábado e Domingo)
            if (dayOfWeek === 0 || dayOfWeek === 6) return;

            const currentHour = now.getHours();
            if (currentHour >= 10) {
              const res = await fetch('/api/card-machine-receivables/pending-due');
              if (!res.ok) return;
              const pending = await res.json();
              if (Array.isArray(pending) && pending.length > 0) {
                const sessionDismissed = sessionStorage.getItem("belafarma_card_reconcile_dismissed");
                if (!sessionDismissed) {
                  setIsCardMachineModalOpen(true);
                  const isMonday = dayOfWeek === 1;
                  addToast(
                    isMonday 
                      ? `💳 Acumulado de Fim de Semana disponível para conferência (${pending.length} repasses)!` 
                      : `💳 ${pending.length} repasse(s) de maquininha a conferir hoje!`, 
                    "info"
                  );
                }
              }
            }
          } catch (err) {
            console.error("Erro ao checar pendências de maquininha:", err);
          }
        };

        checkCardMachinePending();
      }

      // --- Lógica de Auto-exibição do Mural de Pendências ao entrar ---
      const checkMuralPendencias = async () => {
        try {
          const res = await fetch(`/api/mural/pendencias?userId=${encodeURIComponent(user.id)}&userName=${encodeURIComponent(user.name)}`);
          if (!res.ok) return;
          const data = await res.json();
          if (data.success) {
            const count = data.totalMinhasPendencias || (data.produtosParados ? data.produtosParados.length : 0);
            setMuralPendingCount(count);
            
            const sessionDismissed = sessionStorage.getItem("belafarma_mural_dismissed");
            if (count > 0 && !sessionDismissed) {
              setIsMuralOpen(true);
            }
          }
        } catch (err) {
          console.error("Erro ao checar pendências do mural:", err);
        }
      };

      checkMuralPendencias();

      return () => {
        events.forEach((event) => window.removeEventListener(event, reset));
        if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
      };
    }
  }, [user, isMobile]);

  // Check upcoming appointment notifications periodically
  const notifiedAppointmentsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!user) return;
    const checkAppointmentReminders = async () => {
      try {
        const res = await fetch('/api/appointments/upcoming-reminders');
        if (!res.ok) return;
        const upcoming: any[] = await res.json();
        if (Array.isArray(upcoming)) {
          const now = new Date();
          upcoming.forEach(appt => {
            if (notifiedAppointmentsRef.current.has(appt.id)) return;
            const start = new Date(appt.startDate);
            const diffMin = Math.round((start.getTime() - now.getTime()) / (60 * 1000));
            const reminderSetting = appt.reminderMinutes !== undefined ? appt.reminderMinutes : 15;
            
            if (diffMin <= reminderSetting && diffMin >= -5) {
              notifiedAppointmentsRef.current.add(appt.id);
              const timeLabel = diffMin <= 0 ? 'agora' : `em ${diffMin} min`;
              addToast(`📌 Lembrete de Compromisso: "${appt.title}" (${timeLabel})`, 'info');
            }
          });
        }
      } catch (err) {
        console.error('Error checking appointment reminders:', err);
      }
    };

    checkAppointmentReminders();
    const interval = setInterval(checkAppointmentReminders, 60000);
    return () => clearInterval(interval);
  }, [user]);

  useEffect(() => {
    localStorage.setItem('belinha_theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // --- 🔔 NOTIFICAÇÕES INTELIGENTES (SSE) ---
  useEffect(() => {
    if (!user) return;

    let lastNotificationTime = 0;
    const eventSource = new EventSource('/api/webhook/stream');
    
    eventSource.onmessage = (event) => {
      if (event.data === 'message') {
        const now = Date.now();
        // Debounce de 15 segundos
        if (now - lastNotificationTime > 15000) {
          lastNotificationTime = now;
          if (document.hidden || !document.hasFocus()) {
            tocarSino();
          }
        }
      }
    };

    return () => {
      eventSource.close();
    };
  }, [user]);

  // Sintetizador de Som Leve (Web Audio API) - Ding suave de notificação
  const tocarSino = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // Frequência alta inicial
      oscillator.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.5); // Fading para grave

      gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.3, audioCtx.currentTime + 0.05); // Volume sobe muito rápido
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 1.5); // Ecos no fundo

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.start(audioCtx.currentTime);
      oscillator.stop(audioCtx.currentTime + 1.5);
    } catch (e) {
      console.log('Navegador bloqueou áudio ou erro interno:', e);
    }
  };

  const fetchData = async () => {
    setIsLoading(true);
    console.log("fetchData: Iniciando...");
    try {
      const response = await fetch(`/api/all-data?_t=${new Date().getTime()}`);
      console.log("fetchData: Resposta da API recebida.", response);
      if (!response.ok) {
        throw new Error(`Network response was not ok: ${response.statusText}`);
      }
      const data = await response.json();
      console.log("fetchData: Dados processados.", data);

      // Fetch tasks separately since it was not in all-data earlier, 
      // but let's assume we'll update the backend or just fetch it here for now.
      const tasksResponse = await fetch('/api/tasks?includeArchived=false');
      if (tasksResponse.ok) {
        const tasksData = await tasksResponse.json();
        setTasks(tasksData);
      }

      setOrders(data.orders.documents || []);
      setUsers(data.users.documents || []);
      setShortages(data.shortages.documents || []);
      setLogs(data.logs.documents || []);
      setBoletos(data.boletos.documents || []);
      setMonthlyLimits(data.monthlyLimits.documents || []);
      setCashClosings(data.cashClosings.documents || []);
      setDailyRecords(data.dailyRecords.documents || []);
      setFixedAccounts(data.fixedAccounts.documents || []);
    } catch (err) {
      console.error("fetchData: Erro ao buscar dados do backend:", err);
      // Aqui você poderia implementar uma lógica de fallback ou mostrar um erro para o usuário
    } finally {
      setIsLoading(false);
      console.log("fetchData: Finalizado. isLoading set para false.");
    }
  };

  const createLog = async (
    category: SystemLog["category"],
    action: string,
    details: string
  ) => {
    if (!user) return;
    const newLog: SystemLog = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(),
      userName: user.name,
      userId: user.id,
      category,
      action,
      details,
    };
    const updatedLogs = [newLog, ...logs].slice(0, 100);
    setLogs(updatedLogs);

    try {
      await fetch('/api/logs', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newLog),
      });
    } catch (e) {
      console.error("Failed to create log:", e);
      // Not critical, so no rollback needed
    }
  };

  const addOrder = async (order: Order) => {
    const previousOrders = [...orders];
    
    // Optimistic UI update
    const updated = [order, ...orders];
    setOrders(updated);
    
    createLog(
      "Pedidos",
      "Criou Pedido",
      `Distribuidora: ${order.distributor}, Valor: R$ ${order.totalValue}`
    );

    try {
      const formData = new FormData();
      Object.keys(order).forEach(key => {
        if (key === 'boletoFile') {
          if (order.boletoFile) {
            formData.append('boletoFile', order.boletoFile);
          }
        } else if (key === 'installments') {
          formData.append('installments', JSON.stringify(order.installments || []));
        } else {
          formData.append(key, (order as any)[key]);
        }
      });

      const response = await fetch('/api/orders', {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Erro no servidor: ${response.statusText}`);
      }
      
      addToast("✅ Pedido salvo com sucesso!", "success");
      fetchData(); // Refresh to get the actual ID from server
    } catch (e) {
      console.error("Failed to add order:", e);
      setOrders(previousOrders); // Rollback
      addToast("❌ Erro ao salvar pedido. Tente novamente.", "error");
    }
  };

  const updateOrder = async (updatedOrder: Order) => {
    const previousOrders = [...orders];
    
    // Optimistic UI update
    const updatedList = orders.map((o) =>
      o.id === updatedOrder.id ? updatedOrder : o
    );
    setOrders(updatedList);
    
    createLog(
      "Pedidos",
      "Atualizou Pedido",
      `ID: ${updatedOrder.id}, Status: ${updatedOrder.status}`
    );

    try {
      const formData = new FormData();
      Object.keys(updatedOrder).forEach(key => {
        if (key === 'boletoFile') {
          if (updatedOrder.boletoFile) {
            formData.append('boletoFile', updatedOrder.boletoFile);
          }
        } else if (key === 'installments') {
          formData.append('installments', JSON.stringify(updatedOrder.installments || []));
        } else {
          formData.append(key, (updatedOrder as any)[key]);
        }
      });

      const response = await fetch(`/api/orders/${updatedOrder.id}`, {
        method: "PUT",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Erro no servidor: ${response.statusText}`);
      }

      addToast("✅ Pedido atualizado com sucesso!", "success");
    } catch (e) {
      console.error("Failed to update order:", e);
      setOrders(previousOrders); // Rollback
      addToast("❌ Erro ao atualizar pedido. Tente novamente.", "error");
    }
  };

  const updateBoletoStatus = async (boletoId: string, status: BoletoStatus) => {
    const originalBoletos = [...boletos];
    const updatedBoletos = boletos.map(b => 
      b.id === boletoId ? { ...b, status } : b
    );
    setBoletos(updatedBoletos);
    
    createLog("Financeiro", "Pagou Boleto", `Boleto ID: ${boletoId}`);

    try {
       await fetch(`/api/boletos/${boletoId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
    } catch(e) {
      console.error("Failed to update boleto status:", e);
      setBoletos(originalBoletos); // Rollback on error
    }
  };

  const handleUpdateBoletos = async (orderId: string, boletos: Boleto[]) => {
    // Optimistic update of the UI is tricky here, because IDs might change.
    // A simple refetch might be the most reliable approach.
    try {
      const response = await fetch(`/api/orders/${orderId}/boletos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(boletos),
      });
      if (!response.ok) {
        throw new Error('Failed to update boletos on the server.');
      }
      // Refetch boletos to ensure UI is in sync with the database
      fetchData(); 
    } catch(e) {
      console.error("Failed to update boletos:", e);
      // Optional: show an error message to the user
    }
  };

  const handleSaveLimit = async (limit: MonthlyLimit) => {
    try {
      const response = await fetch('/api/monthly-limits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(limit),
      });
      if (!response.ok) {
        throw new Error('Failed to save limit on the server.');
      }
      // Refetch all data to ensure consistency
      fetchData(); 
    } catch(e) {
      console.error("Failed to save limit:", e);
    }
  };

  const deleteOrder = async (id: string) => {
    const orderToDelete = orders.find((o) => o.id === id);
    // Optimistic UI update
    const updated = orders.filter((o) => o.id !== id);
    setOrders(updated);
    createLog(
      "Pedidos",
      "Excluiu Pedido",
      `Distribuidora: ${orderToDelete?.distributor}`
    );

    try {
      await fetch(`/api/orders/${id}`, {
        method: "DELETE",
      });
    } catch (e) {
      console.error("Failed to delete order:", e);
      // TODO: Implement rollback logic
    }
  };

  const addShortage = async (shortage: ProductShortage) => {
    const updated = [shortage, ...shortages];
    setShortages(updated);
    createLog("Faltas", "Registrou Falta", `Produto: ${shortage.productName}`);

    try {
      await fetch('/api/shortages', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(shortage),
      });
    } catch (e) {
      console.error("Failed to add shortage:", e);
      // TODO: Implement rollback logic
    }
  };

  const deleteShortage = async (id: string) => {
    const sToDelete = shortages.find((s) => s.id === id);
    const updated = shortages.filter((s) => s.id !== id);
    setShortages(updated);
    createLog("Faltas", "Removeu Falta", `Produto: ${sToDelete?.productName}`);

    try {
      await fetch(`/api/shortages/${id}`, {
        method: "DELETE",
      });
    } catch (e) {
      console.error("Failed to delete shortage:", e);
      // TODO: Implement rollback logic
    }
  };

  const updateShortage = async (id: string, purchased: boolean, ordered: boolean) => {
    const sToUpdate = shortages.find((s) => s.id === id);
    if (!sToUpdate) return;

    // Optimistic UI Update
    const updated = shortages.map((s) => 
      s.id === id ? { ...s, purchased, ordered } : s
    );
    setShortages(updated);

    createLog(
      "Faltas",
      "Atualizou Status",
      `Produto: ${sToUpdate.productName} | Pedido: ${ordered ? "Sim" : "Não"} | Comprado: ${purchased ? "Sim" : "Não"}`
    );

    try {
      const response = await fetch(`/api/shortages/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purchased, ordered }),
      });

      if (!response.ok) {
        throw new Error("Failed to update shortage status on server.");
      }
    } catch (e) {
      console.error("Failed to update shortage status:", e);
      addToast("❌ Erro ao atualizar status da falta. Sincronizando...", "error");
      fetchData(); // Rollback to server state
    }
  };

  const addUser = async (newUser: User) => {
    // Optimistic UI update
    const updated = [...users, newUser];
    setUsers(updated);
    createLog(
      "Usuários",
      "Criou Usuário",
      `Nome: ${newUser.name}, Nível: ${newUser.role}`
    );

    try {
      const response = await fetch('/api/users', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newUser),
      });
      if (!response.ok) {
        // Handle specific errors, like duplicate access key
        if (response.status === 409) {
          addToast("Erro: Chave de acesso já está em uso.", "error");
        }
        throw new Error("Server responded with an error.");
      }
    } catch (e) {
      console.error("Failed to add user:", e);
      // TODO: Implement rollback logic
      // For now, just refetch to get the correct state
      fetchData();
    }
  };

    const deleteUser = async (id: string) => {
    const userToDelete = users.find((u) => u.id === id);
    if (!userToDelete) return;

    // Optimistic UI update
    const updated = users.filter((u) => u.id !== id);
    setUsers(updated);
    createLog("Usuários", "Excluiu Usuário", `Nome: ${userToDelete.name}`);

    try {
      await fetch(`/api/users/${id}`, {
        method: "DELETE",
      });
    } catch (e) {
      console.error("Failed to delete user:", e);
      // TODO: Implement rollback logic
      fetchData(); // Refetch to sync with server
    }
  };

  const addBoleto = async (boleto: Partial<Boleto> & { boletoFile?: File }) => {
    const newBoleto = {
      ...boleto,
      id: Math.random().toString(36).substr(2, 9),
      status: BoletoStatus.PENDENTE,
      order_id: boleto.order_id || null, // Ensure order_id is explicitly null if not provided
    };

    const updatedBoletos = [newBoleto, ...boletos];
    setBoletos(updatedBoletos as Boleto[]);

    createLog(
      "Financeiro",
      "Adicionou Boleto",
      `ID: ${newBoleto.id}, Valor: R$ ${newBoleto.value}`
    );

    try {
      // Send boleto data as application/json instead of FormData, as file upload is no longer present.
      await fetch('/api/boletos', {
        method: "POST",
        headers: { "Content-Type": "application/json" }, // Specify JSON content type
        body: JSON.stringify(newBoleto), // Send the newBoleto object as JSON
      });

      fetchData();
    } catch (e) {
      console.error("Failed to add boleto:", e);
      // TODO: Implement rollback logic
    }
  };

  const handleUpdateBoleto = async (updatedBoleto: Boleto) => {
    const originalBoletos = [...boletos];
    setBoletos(boletos.map(b => b.id === updatedBoleto.id ? updatedBoleto : b));
    createLog("Financeiro", "Atualizou Boleto", `ID: ${updatedBoleto.id}, Valor: R$ ${updatedBoleto.value}`);

    try {
      const response = await fetch(`/api/boletos/${updatedBoleto.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedBoleto),
      });
      if (!response.ok) {
        throw new Error('Failed to update boleto on server.');
      }
    } catch (e) {
      console.error("Failed to update boleto:", e);
      setBoletos(originalBoletos); // Rollback on error
    }
  };

  const handleDeleteBoleto = async (boletoId: string) => {
    const originalBoletos = [...boletos];
    const boletoToDelete = boletos.find(b => b.id === boletoId);
    if (!boletoToDelete) return;

    setBoletos(boletos.filter(b => b.id !== boletoId));
    createLog("Financeiro", "Excluiu Boleto", `Fornecedor: ${boletoToDelete.supplierName}, Valor: R$ ${boletoToDelete.value}`);

    try {
      const response = await fetch(`/api/boletos/${boletoId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('Failed to delete boleto on server.');
      }
    } catch (e) {
      console.error("Failed to delete boleto:", e);
      setBoletos(originalBoletos); // Rollback on error
    }
  };

  const markDailyRecordsProcessed = async (recordIds: string[], cashClosingId: string) => {
    console.log('=== App.tsx markDailyRecordsProcessed called ===');
    console.log('Record IDs:', recordIds);
    console.log('Cash Closing ID:', cashClosingId);
    
    try {
      const response = await fetch('/api/daily-records/mark-processed', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordIds, cashClosingId }),
      });
      
      console.log('Mark processed response:', response.status, response.statusText);
      
      if (response.ok) {
        const data = await response.json();
        console.log('Mark processed result:', data);
      }
      
      console.log('Calling fetchData to refresh...');
      await fetchData(); // Refresh daily records after processing
      console.log('fetchData completed');
    } catch (e) {
      console.error("Failed to mark daily records as processed:", e);
    }
  };

  const isTauri = typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);

  if (!user)
    return (
      <Auth
        onLogin={(u) => {
          setUser(u);
          localStorage.setItem("belinha_session_user", JSON.stringify(u));
          createLog("Sistema", "Login", "Acesso efetuado");
        }}
      />
    );

  if (isTauri) {
    return (
      <div className="h-screen bg-slate-50 dark:bg-slate-950 overflow-y-auto">
        <div className="max-w-7xl mx-auto p-4">
          <WhatsAppVendas />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-300 overflow-hidden">
      <PwaUpdater />
      <Sidebar
        user={user}
        currentView={currentView}
        setView={handleNavigate}
        onLogout={() => {
          createLog("Sistema", "Logout", "Sessão encerrada");
          handleLogout();
        }}
        theme={theme}
        setTheme={setTheme}
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
        tasks={tasks}
        boletos={boletos}
        onOpenTeraModal={() => setIsTeraModalOpen(true)}
        isBudgetBusted={isBudgetBusted}
        onOpenMural={() => setIsMuralOpen(true)}
        muralPendingCount={muralPendingCount}
      />
      <MobileHeader 
        onOpenSidebar={() => setIsSidebarOpen(true)} 
        onSearch={() => handleNavigate("medication-search")} 
        isBudgetBusted={isBudgetBusted}
      />
      <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-8">
        <div className="max-w-7xl mx-auto pb-10">
          {isLoading ? (
            <div className="h-[60vh] flex flex-col items-center justify-center gap-4">
              <Loader2 className="w-10 h-10 text-red-600 animate-spin" />
            </div>
          ) : (
            <>
              {currentView === "dashboard" && (
                <Dashboard 
                  user={user} 
                  orders={orders} 
                  shortages={shortages} 
                  cashClosings={cashClosings} 
                  boletos={boletos} 
                  fixedAccounts={fixedAccounts} 
                  monthlyLimits={monthlyLimits}
                  onNavigate={handleNavigate} 
                  onUpdateOrder={updateOrder}
                  onUpdateBoletos={handleUpdateBoletos}
                  isMobile={isMobile}
                />
              )}
              {currentView === "orders" && (
                <Orders
                  user={user}
                  orders={orders}
                  onAdd={addOrder}
                  onUpdate={updateOrder}
                  onDelete={deleteOrder}
                  onUpdateBoletos={handleUpdateBoletos}
                />
              )}
              {currentView === "shortages" && (
                <ProductShortages
                  user={user}
                  shortages={shortages}
                  onAdd={addShortage}
                  onDelete={deleteShortage}
                  onUpdate={updateShortage}
                  onRefresh={fetchData}
                />
              )}
              {currentView === "quotations" && <Quotations />}
              {currentView === "medication-search" && <MedicationSearch />}
              {currentView === "daily-records" && (
                <DailyRecords
                  user={user}
                  onLog={(act, det) => createLog("Financeiro", act, det)}
                  dailyRecords={dailyRecords}
                  onSave={fetchData} // Use fetchData to refresh parent state
                />
              )}
              {currentView === "cash-closing" && user.role === UserRole.ADM && (
                <CashClosing
                  user={user}
                  onFinish={() => handleNavigate("dashboard")}
                  onLog={(act, det) => createLog("Financeiro", act, det)}
                  onSave={fetchData}
                  dailyRecords={dailyRecords}
                  onMarkDailyRecordsProcessed={markDailyRecordsProcessed}
                />
              )}
              {currentView === "safe" && user.role === UserRole.ADM && (
                <Safe
                  user={user}
                  onLog={(act, det) => createLog("Cofre", act, det)}
                />
              )}
              {currentView === "financial" && user.role === UserRole.ADM && (
                <Financial 
                  user={user}
                  orders={orders} 
                  boletos={boletos} 
                  fixedAccounts={fixedAccounts} 
                  monthlyLimits={monthlyLimits}
                  onUpdateBoletoStatus={updateBoletoStatus} 
                  onAddBoleto={addBoleto}
                  onUpdateBoleto={handleUpdateBoleto}
                  onDeleteBoleto={handleDeleteBoleto}
                  onLog={(act, det) => createLog("Financeiro", act, det)}
                  cashClosings={cashClosings}
                  onOpenBudgetSummary={() => setIsBudgetSummaryOpen(true)}
                />
              )}
              {currentView === "users" && user.role === UserRole.ADM && (
                <Users
                  currentUser={user}
                  users={users}
                  onAdd={addUser}
                  onDelete={deleteUser}
                />
              )}
              {currentView === "logs" && user.role === UserRole.ADM && (
                <Logs logs={logs} />
              )}
              {currentView === "checking-account" && user.role === UserRole.ADM && (
                <CheckingAccount user={user} />
              )}
              {currentView === 'crediario-report' && user.role === UserRole.ADM && (
                <CrediarioReport />
              )}
              {(currentView === 'agenda' || currentView === 'task-management') && (
                <AgendaCalendar currentUser={user} users={users} />
              )}

              {currentView === 'customers' && (
                <CustomersPage 
                  user={user} 
                  onLog={(act, det) => createLog('Sistema', act, det)}
                />
              )}
              {currentView === 'days-in-debt' && user.role === UserRole.ADM && (
                <DaysInDebt 
                  boletos={boletos} 
                  orders={orders} 
                  fixedAccounts={fixedAccounts} 
                  cashClosings={cashClosings} 
                  onAddBoleto={addBoleto}
                  onUpdateBoletoStatus={updateBoletoStatus}
                  onRefreshData={fetchData}
                />
              )}
              {currentView === 'debtors-report' && user.role === UserRole.ADM && (
                <DebtorsReport />
              )}
              {currentView === 'inventario' && (
                <InventoryManager user={user} />
              )}
              {currentView === 'backups' && user.role === UserRole.ADM && (
                <BackupManager />
              )}
              {currentView === 'invoices' && user.role === UserRole.ADM && (
                <InvoiceList />
              )}
              {currentView === 'suppliers' && user.role === UserRole.ADM && (
                <SuppliersManager />
              )}
              {currentView === 'compras-live' && (
                <ComprasLive />
              )}
              {currentView === 'purchase-calendar' && user.role === UserRole.ADM && (
                <PurchaseCalendar user={user} />
              )}
              {currentView === 'stock' && user.role === UserRole.ADM && (
                <StockManagement user={user} />
              )}
              {currentView === 'consignados' && user.role === UserRole.ADM && (
                <ConsignadosManager 
                  user={user} 
                  onLog={(act, det) => createLog("Estoque", act, det)} 
                />
              )}
              {currentView === 'ifood-control' && user.role === UserRole.ADM && (
                <IFoodControl 
                  user={user} 
                  onLog={(act, det) => createLog("Financeiro", act, det)} 
                />
              )}
              {currentView === 'notifications' && (
                <NotificationsPage 
                  tasks={tasks}
                  boletos={boletos}
                  user={user}
                  onNavigate={handleNavigate}
                  onViewTask={(task) => {
                    setSelectedTask(task);
                    setCurrentView('task-management');
                  }}
                />
              )}
              {currentView === 'messaging-center' && user.role === UserRole.ADM && (
                <MessagingCenter />
              )}
              {currentView === 'ai-portal' && user.role === UserRole.ADM && (
                <AIPortal />
              )}
              {currentView === 'financial-health' && user.role === UserRole.ADM && (
                <FinancialHealthAdvisor />
              )}
              {currentView === 'caixa-provisoes' && user.role === UserRole.ADM && (
                <CaixaProvisoes />
              )}
              {currentView === 'sales-report' && user.role === UserRole.ADM && (
                <SalesReport />
              )}
              {currentView === 'critical-stock' && user.role === UserRole.ADM && (
                <CriticalStockManager />
              )}
              {currentView === 'system-watcher' && user.role === UserRole.ADM && (
                <SystemWatcher />
              )}
              {currentView === 'radio-manager' && user.role === UserRole.ADM && (
                <RadioManager />
              )}
              {currentView === 'whatsapp-crm' && user.role === UserRole.ADM && (
                <WhatsAppCRM />
              )}
              {currentView === 'whatsapp-vendas' && (
                <WhatsAppVendas />
              )}
              {currentView === 'deliveries' && (
                <DeliveriesPage 
                  onNavigate={handleNavigate} 
                  onSelectPendingReview={(delivery, mode = 'pedido') => {
                    setPendingReviewMode(mode);
                    setSelectedPendingReview(delivery);
                  }}
                  reviewedDeliveryId={lastReviewedDeliveryId}
                />
              )}
              {currentView === 'labels' && <EtiquetasManager user={user} />}
              {currentView === 'anvisa-alerts' && <AnvisaAlerts theme={theme} />}
              {currentView === 'notes' && <NotesManager user={user} theme={theme} />}
              {currentView === 'card-machines' && user.role === UserRole.ADM && (
                <CardMachinesManager user={user} />
              )}
              {currentView === 'price-manager' && user.role === UserRole.ADM && (
                <PriceManager />
              )}
              {currentView === "settings" && <Settings user={user} limits={monthlyLimits} onSaveLimit={handleSaveLimit} />}
            </>
          )}
        </div>
        <footer className="w-full text-center py-4 text-xs text-slate-400 font-medium absolute bottom-0 left-0 bg-slate-100">
          <p>Versão Beta - Desenvolvido por Edevaldo Cruz</p>
        </footer>
      </main>

      {/* Modal de Incentivo VW Tera exclusivo para Nayane */}
      {!isMobile && <TeraIncentiveModal isOpen={isTeraModalOpen} onClose={() => setIsTeraModalOpen(false)} />}

      {/* Modal de Conferência Diária 10h de Maquininha para Edevaldo */}
      <CardMachineReconcileModal
        isOpen={isCardMachineModalOpen}
        onClose={() => {
          setIsCardMachineModalOpen(false);
          sessionStorage.setItem("belafarma_card_reconcile_dismissed", "true");
        }}
        onNavigateToFullView={() => {
          handleNavigate('card-machines');
        }}
        userName={user?.name}
        onReconcileSuccess={() => {
          fetchData();
        }}
      />

      {/* Modal / Mural de Pendências e Produtos Parados 90d+ */}
      {user && (
        <MuralModal
          isOpen={isMuralOpen}
          onClose={() => {
            setIsMuralOpen(false);
            sessionStorage.setItem("belafarma_mural_dismissed", "true");
          }}
          user={user}
          tasks={tasks}
          boletos={boletos}
          pendingReviewCount={pendingReviewCount}
          anvisaAlertCount={anvisaAlertCount}
          onNavigate={handleNavigate}
          onRefreshPending={async () => {
            try {
              const res = await fetch(`/api/mural/pendencias?userId=${encodeURIComponent(user.id)}&userName=${encodeURIComponent(user.name)}`);
              if (res.ok) {
                const data = await res.json();
                if (data.success) {
                  setMuralPendingCount(data.totalMinhasPendencias || 0);
                }
              }
            } catch (e) {}
          }}
        />
      )}

      {/* Botão Flutuante do Status de Orçamento (Canto Inferior Direito) */}
      <div className={`fixed bottom-10 md:bottom-8 right-4 md:right-8 z-[90] flex-col items-center gap-2 pb-safe ${showMobileFloatingButton ? 'flex' : 'hidden md:flex'}`}>
        {/* Balão de Saldo Diário e Semanal */}
        {currentMonthBudgetStatus !== 'no-budget' && (
          <div className={`
            relative flex flex-col px-4 py-3 rounded-2xl shadow-xl text-xs font-bold
            transition-all duration-500 animate-in fade-in slide-in-from-bottom-2 gap-2
            ${currentMonthBudgetStatus === 'danger'
              ? 'bg-red-600 text-white'
              : currentMonthBudgetStatus === 'warning'
                ? 'bg-amber-500 text-white'
                : 'bg-emerald-600 text-white'
            }
          `}>
            {/* Diário */}
            <div className="flex flex-col items-end border-b border-white/20 pb-2">
              <span className="text-[10px] font-semibold opacity-80 uppercase tracking-wider whitespace-nowrap">Disponível Hoje</span>
              <span className="text-sm font-black whitespace-nowrap">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(currentDailyAvailable)}
              </span>
            </div>
            {/* Semanal */}
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-semibold opacity-80 uppercase tracking-wider whitespace-nowrap">Disponível na Semana</span>
              <span className="text-sm font-black whitespace-nowrap">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(currentWeekAvailable)}
              </span>
            </div>
            {/* Ponteiro do balão */}
            <span className={`
              absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45
              ${currentMonthBudgetStatus === 'danger'
                ? 'bg-red-600'
                : currentMonthBudgetStatus === 'warning'
                  ? 'bg-amber-500'
                  : 'bg-emerald-600'
              }
            `} />
          </div>
        )}

        {/* Botão circular */}
        <button
          onClick={() => setIsBudgetSummaryOpen(true)}
          className={`flex items-center justify-center w-14 h-14 md:w-20 md:h-20 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-full shadow-2xl transition-all duration-300 hover:scale-110 active:scale-95`}
          title="Ver Painel de Orçamentos"
        >
          <span className="text-2xl md:text-4xl relative select-none flex items-center justify-center">
            {budgetEmoji}
            {(currentMonthBudgetStatus === 'warning' || currentMonthBudgetStatus === 'danger') && (
              <span className={`absolute -inset-1 rounded-full animate-ping border-2 ${currentMonthBudgetStatus === 'danger' ? 'border-red-500' : 'border-amber-500'} opacity-75`} />
            )}
          </span>
        </button>
      </div>

      {/* Pop-up de Somas de Boletos e Orçamentos por Mês */}
      {isBudgetSummaryOpen && (
        <BoletoBudgetSummaryModal
          boletos={boletos}
          monthlyLimits={monthlyLimits}
          onClose={handleCloseBudgetSummary}
        />
      )}

      {/* Modal de Questionário Interativo de Auditoria (Revisão Pendente) */}
      {selectedPendingReview && (
        <PendingReviewModal
          delivery={selectedPendingReview}
          initialMode={pendingReviewMode}
          onClose={() => setSelectedPendingReview(null)}
          onSubmitSuccess={handleReviewSubmitted}
        />
      )}
    </div>
  );
};


export default App;

