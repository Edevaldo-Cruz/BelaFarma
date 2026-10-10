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
import { LossesManager } from "./components/LossesManager";
import { PwaUpdater } from "./components/PwaUpdater";
import { MobileHeader } from "./components/MobileHeader";
import { SalesReport } from "./components/SalesReport";
import { CriticalStockManager } from "./components/CriticalStockManager";
import { SystemWatcher } from "./components/SystemWatcher";
import { PriceManager } from "./components/PriceManager";
import { PricingSimulator } from "./components/PricingSimulator";
import { AgendaCalendar } from "./components/AgendaCalendar";
import { AnvisaAlerts } from "./components/AnvisaAlerts";
import { NotesManager } from "./components/NotesManager";
import { CardMachinesManager } from "./components/CardMachinesManager";
import { CardMachineReconcileModal } from "./components/CardMachineReconcileModal";
import { MuralModal } from "./components/MuralModal";
import { CentralCompras } from "./components/CentralCompras";
import { BelaPedPortal } from "./components/compras/BelaPedPortal";
import { EstoqueIdealModal } from "./components/compras/EstoqueIdealModal";
import { VersionNotifier } from "./components/VersionNotifier";
import { VersionModal } from "./components/VersionModal";
import { useToast } from "./components/ToastContext";
import { StartupModalManager, StartupModalItem, StartupModalType } from "./components/StartupModalManager";
import { TemperatureMap } from "./components/TemperatureMap";
import { TemperaturePrintReminderModal } from "./components/TemperaturePrintReminderModal";
import { AnaliseReposicao } from "./components/AnaliseReposicao";
import { LiquidacaoCaixa } from "./components/LiquidacaoCaixa";
import { VitrineSplash } from "./components/vitrine/VitrineSplash";
import { VitrineAniversario } from "./components/vitrine/VitrineAniversario";
import { isPublicVitrineRoute } from "./components/vitrine/vitrineTypes";


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
import { trackViewUsage, calculateWeeklyBudgetsCascade, getLocalDateKey } from "./utils";

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
  const [isPublicRoute, setIsPublicRoute] = useState<boolean>(() => isPublicVitrineRoute());
  const [showSplash, setShowSplash] = useState<boolean>(true);

  useEffect(() => {
    const handleRouteChange = () => {
      const active = isPublicVitrineRoute();
      setIsPublicRoute(active);
      if (active) {
        setShowSplash(true);
      }
    };
    window.addEventListener("popstate", handleRouteChange);
    window.addEventListener("hashchange", handleRouteChange);
    return () => {
      window.removeEventListener("popstate", handleRouteChange);
      window.removeEventListener("hashchange", handleRouteChange);
    };
  }, []);

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
  const [isEstoqueIdealModalOpen, setIsEstoqueIdealModalOpen] = useState(false);
  const [isMuralOpen, setIsMuralOpen] = useState(false);
  const [startupQueue, setStartupQueue] = useState<StartupModalItem[]>([]);
  const [startupIndex, setStartupIndex] = useState(0);
  const [isStartupActive, setIsStartupActive] = useState(false);

  const activeStartupModalId: StartupModalType | null = 
    isStartupActive && startupQueue[startupIndex] ? startupQueue[startupIndex].id : null;

  const handleCloseStartup = () => {
    setIsStartupActive(false);
    setStartupQueue([]);
    setIsTeraModalOpen(false);
    setIsEstoqueIdealModalOpen(false);
    setIsCardMachineModalOpen(false);
    setIsMuralOpen(false);
  };
  const [muralPendingCount, setMuralPendingCount] = useState(0);
  const [pendingReviewCount, setPendingReviewCount] = useState(0);
  const [anvisaAlertCount, setAnvisaAlertCount] = useState(0);
  const { addToast } = useToast();
  const [isBudgetSummaryOpen, setIsBudgetSummaryOpen] = useState(true);
  const [showMobileFloatingButton, setShowMobileFloatingButton] = useState(true);
  const [selectedPendingReview, setSelectedPendingReview] = useState<Delivery | null>(null);
  const [pendingReviewMode, setPendingReviewMode] = useState<'pedido' | 'cotacao'>('pedido');
  const [lastReviewedDeliveryId, setLastReviewedDeliveryId] = useState<string | null>(null);
  const [isVersionModalOpen, setIsVersionModalOpen] = useState(false);
  const [tempReminderData, setTempReminderData] = useState<{
    pending: boolean;
    previousMonth: string;
    previousMonthLabel: string;
  } | null>(null);
  const [isTempReminderOpen, setIsTempReminderOpen] = useState(false);

  const handleOpenAndPrintTemp = (targetMonth: string) => {
    try {
      localStorage.setItem(`belafarma_temp_printed_${targetMonth}`, 'true');
    } catch (e) {}
    setIsTempReminderOpen(false);
    setCurrentView('temperature-map');
  };

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

  // Cálculos do Orçamento dos 2 Próximos Meses (M+1 e M+2) para o Botão Flutuante e Tema
  const { isBudgetBusted, budgetEmoji, currentMonthBudgetStatus, nextMonthsInfo } = useMemo(() => {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonthIndex = today.getMonth(); // 0-11

    // Mês 1 seguinte (M+1)
    const m1Index = (currentMonthIndex + 1) % 12;
    const y1 = currentMonthIndex + 1 > 11 ? currentYear + 1 : currentYear;
    const m1Number = m1Index + 1; // 1-12

    // Mês 2 seguinte (M+2)
    const m2Index = (currentMonthIndex + 2) % 12;
    const y2 = currentMonthIndex + 2 > 11 ? currentYear + 1 : currentYear;
    const m2Number = m2Index + 1; // 1-12

    const limit1Obj = monthlyLimits.find(l => l.month === m1Number && l.year === y1);
    const limit2Obj = monthlyLimits.find(l => l.month === m2Number && l.year === y2);

    const limit1 = limit1Obj && limit1Obj.limit > 0 ? limit1Obj.limit : 0;
    const limit2 = limit2Obj && limit2Obj.limit > 0 ? limit2Obj.limit : 0;

    // Se qualquer um dos dois meses futuros não tiver limite cadastrado (>0), status é neutro ('no-budget')
    if (limit1 <= 0 || limit2 <= 0) {
      return {
        isBudgetBusted: false,
        budgetEmoji: '🤍',
        currentMonthBudgetStatus: 'no-budget' as const,
        nextMonthsInfo: {
          m1: { month: m1Number, year: y1, limit: limit1, spent: 0, available: 0, status: 'no-budget' as const },
          m2: { month: m2Number, year: y2, limit: limit2, spent: 0, available: 0, status: 'no-budget' as const },
        }
      };
    }

    // Calcula gastos totais já lançados do Mês 1
    const spent1 = boletos.filter(b => {
      if (!b || !b.due_date) return false;
      const cleanDate = String(b.due_date).split('T')[0];
      const parts = cleanDate.split('-');
      if (parts.length < 2) return false;
      const by = Number(parts[0]);
      const bm = Number(parts[1]);
      return by === y1 && bm === m1Number;
    }).reduce((sum, b) => sum + (b.value || 0), 0);

    // Calcula gastos totais já lançados do Mês 2
    const spent2 = boletos.filter(b => {
      if (!b || !b.due_date) return false;
      const cleanDate = String(b.due_date).split('T')[0];
      const parts = cleanDate.split('-');
      if (parts.length < 2) return false;
      const by = Number(parts[0]);
      const bm = Number(parts[1]);
      return by === y2 && bm === m2Number;
    }).reduce((sum, b) => sum + (b.value || 0), 0);


    const calcStatus = (spent: number, limit: number): 'safe' | 'warning' | 'danger' => {
      const pct = (spent / limit) * 100;
      if (pct >= 100) return 'danger';
      if (pct >= 80) return 'warning';
      return 'safe';
    };

    const status1 = calcStatus(spent1, limit1);
    const status2 = calcStatus(spent2, limit2);

    // Pior cenário entre os dois meses
    let overallStatus: 'safe' | 'warning' | 'danger' = 'safe';
    if (status1 === 'danger' || status2 === 'danger') {
      overallStatus = 'danger';
    } else if (status1 === 'warning' || status2 === 'warning') {
      overallStatus = 'warning';
    }

    let emoji = '💚';
    if (overallStatus === 'danger') emoji = '💔';
    else if (overallStatus === 'warning') emoji = '💛';

    return {
      isBudgetBusted: overallStatus === 'danger',
      budgetEmoji: emoji,
      currentMonthBudgetStatus: overallStatus,
      nextMonthsInfo: {
        m1: { month: m1Number, year: y1, limit: limit1, spent: spent1, available: limit1 - spent1, status: status1 },
        m2: { month: m2Number, year: y2, limit: limit2, spent: spent2, available: limit2 - spent2, status: status2 },
      }
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
    handleCloseStartup();
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

      // --- Lógica Centralizada de Popups de Abertura (Fila Limitada a 2 por Ordem de Prioridade) ---
      const initStartupPopups = async () => {
        const candidateItems: StartupModalItem[] = [];
        const hoje = new Date().toISOString().slice(0, 10);

        // 1. Meta VW Tera (Prioridade 1 Comercial)
        const isNayane = user.name.toLowerCase().includes("nayane");
        if (isNayane && !isMobile) {
          const ultimaDataExibida = localStorage.getItem("tera_popup_last_date");
          if (ultimaDataExibida !== hoje) {
            candidateItems.push({
              id: 'tera',
              title: 'Meta VW Tera 2026',
              badge: 'Incentivo',
              badgeColor: 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
            });
            localStorage.setItem("tera_popup_last_date", hoje);
          }
        }

        // 2. Estoque Ideal (Prioridade 2 Comercial)
        const isBuyer = (user.jobRole && String(user.jobRole).toLowerCase().includes("comprador")) || isNayane;
        if (isBuyer) {
          const ultimaDataEstoqueIdeal = localStorage.getItem("estoque_ideal_last_date");
          if (ultimaDataEstoqueIdeal !== hoje) {
            candidateItems.push({
              id: 'estoque-ideal',
              title: 'Alerta de Estoque Ideal',
              badge: 'Compras',
              badgeColor: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
            });
          }
        }

        // 3. Mural de Pendências (Prioridade 3 Comercial)
        try {
          const res = await fetch(`/api/mural/pendencias?userId=${encodeURIComponent(user.id)}&userName=${encodeURIComponent(user.name)}`);
          if (res.ok) {
            const data = await res.json();
            if (data.success) {
              const isAdm = user.role === UserRole.ADM || String(user.role).toUpperCase().includes('ADM') || String(user.role).toUpperCase().includes('GERENTE');
              const parados = data.totalMinhasPendencias || (data.produtosParados ? data.produtosParados.length : 0);
              const variacoes = isAdm ? (data.totalVariacaoPrecos || 0) : 0;
              const count = parados + variacoes;
              setMuralPendingCount(count);
              
              if (isAdm && variacoes > 0) {
                addToast(`🔔 Atenção ADM: Existem ${variacoes} variações de preço de compras aguardando sua auditoria no Mural!`, 'warning');
              }
              
              const sessionDismissed = sessionStorage.getItem("belafarma_mural_dismissed");
              if (count > 0 && !sessionDismissed) {
                candidateItems.push({
                  id: 'mural',
                  title: 'Mural de Pendências & Auditoria',
                  badge: 'Pendências',
                  badgeColor: 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                });
              }
            }
          }
        } catch (err) {
          console.error("Erro ao checar pendências do mural:", err);
        }

        // 4. Conferência de Maquininha e Provisões (Prioridade 4 Comercial)
        // RESTRITO APENAS PARA O ADM DO FINANCEIRO / EDEVALDO
        const isFinancialAdm = (
          user.name.toLowerCase().includes("edevaldo") || 
          String(user.jobRole || "").toLowerCase().includes("financeiro")
        ) && (
          user.role === UserRole.ADM || 
          String(user.role || "").toUpperCase().includes("ADM") || 
          user.name.toLowerCase().includes("edevaldo")
        );

        if (isFinancialAdm) {
          try {
            const now = new Date();
            const dayOfWeek = now.getDay(); // 0 = Domingo, 6 = Sábado
            // Não há repasse em finais de semana (Sábado e Domingo)
            if (dayOfWeek !== 0 && dayOfWeek !== 6) {
              const [resPending, resClosings, resIFood] = await Promise.all([
                fetch('/api/card-machine-receivables/pending-due'),
                fetch('/api/cash-closings'),
                fetch('/api/ifood-sales/reconcile-today')
              ]);

              let hasIFoodPending = false;
              if (resIFood && resIFood.ok) {
                try {
                  const ifoodJson = await resIFood.json();
                  hasIFoodPending = !!(ifoodJson && ifoodJson.count > 0);
                } catch (e) {}
              }

              if (resPending.ok) {
                const pending = await resPending.json();
                if ((Array.isArray(pending) && pending.length > 0) || hasIFoodPending) {
                  candidateItems.push({
                    id: 'card-machines',
                    title: 'Conferência de Repasses & Provisões',
                    badge: 'Financeiro',
                    badgeColor: 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                  });

                  const isMonday = dayOfWeek === 1;

                  let closings: any[] = [];
                  if (resClosings.ok) {
                    try { closings = await resClosings.json(); } catch(e) {}
                  }

                  const sortedClosings = [...closings].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
                  
                  const yesterday = new Date(now);
                  yesterday.setDate(yesterday.getDate() - 1);
                  const yesterdayStr = getLocalDateKey(yesterday.toISOString());
                  const yesterdayClosing = sortedClosings.find((c: any) => c.date && getLocalDateKey(c.date) === yesterdayStr);

                  const todayKey = getLocalDateKey(now.toISOString());
                  const referenceClosing = yesterdayClosing || sortedClosings.find((c: any) => c.date && getLocalDateKey(c.date) < todayKey) || sortedClosings[0];

                  const refSales = Number(referenceClosing?.totalSales) || 0;
                  const refClosingDate = referenceClosing?.date ? getLocalDateKey(referenceClosing.date) : yesterdayStr;

                  const isDatePastSecondDay = (dateStr: string): boolean => {
                    if (!dateStr) return true;
                    const clean = getLocalDateKey(dateStr);
                    const parts = clean.split('-');
                    if (parts.length !== 3) return true;
                    const [y, m, d] = parts.map(Number);
                    const fromDate = new Date(y, m - 1, d);
                    fromDate.setHours(0, 0, 0, 0);
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    if (fromDate >= today) return false;

                    let bDays = 0;
                    const cur = new Date(fromDate);
                    while (cur < today) {
                      cur.setDate(cur.getDate() + 1);
                      const day = cur.getDay();
                      if (day !== 0 && day !== 6) bDays++;
                    }
                    return bDays > 2;
                  };

                  const isExpired = isDatePastSecondDay(refClosingDate);

                  let isFullyPaid = false;
                  try {
                    const resPaid = await fetch('/api/settings/paid_provisions_dates');
                    if (resPaid.ok) {
                      const dataPaid = await resPaid.json();
                      const paidArr = dataPaid?.value ? JSON.parse(dataPaid.value) : [];
                      if (Array.isArray(paidArr)) {
                        const pPaid = paidArr.includes(`prolabore-${refClosingDate}`);
                        const tPaid = paidArr.includes(`tax-${refClosingDate}`);
                        const rPaid = paidArr.includes(`reserve-${refClosingDate}`);
                        isFullyPaid = pPaid && tPaid && rPaid;
                      }
                    }
                  } catch(e) {}

                  const canShowProvisions = refSales > 0 && !isExpired && !isFullyPaid;
                  const formatBRL = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

                  if (canShowProvisions) {
                    const valProlabore = refSales * 0.12;
                    const valTax = refSales * 0.04;
                    const valReserve = refSales * 0.01;
                    const valTotal = valProlabore + valTax + valReserve;

                    addToast(
                      `💳 ${pending.length} repasse(s) a conferir. Lembre-se de reservar ${formatBRL(valTotal)} para as provisões sobre o fechamento anterior (${formatBRL(refSales)}): Pró-labore ${formatBRL(valProlabore)}, Impostos ${formatBRL(valTax)}, Reserva ${formatBRL(valReserve)}!`,
                      "info"
                    );
                  } else {
                    addToast(
                      isMonday 
                        ? `💳 Acumulado de Fim de Semana disponível para conferência (${pending.length} repasses)!` 
                        : `💳 ${pending.length} repasse(s) de maquininha a conferir hoje!`, 
                      "info"
                    );
                  }
                }
              }
            }
          } catch (err) {
            console.error("Erro ao checar pendências de maquininha:", err);
          }
        }

        // Ordenação estrita por prioridade comercial:
        // 1º Meta VW Tera -> 2º Estoque Ideal -> 3º Mural de Pendências -> 4º Conferência de Maquininha/Provisões
        const priorityOrder: StartupModalType[] = ['tera', 'estoque-ideal', 'mural', 'card-machines'];
        candidateItems.sort((a, b) => priorityOrder.indexOf(a.id) - priorityOrder.indexOf(b.id));

        // Limita a NO MÁXIMO 2 popups na abertura
        const finalQueue = candidateItems.slice(0, 2);

        if (finalQueue.length > 0) {
          setStartupQueue(finalQueue);
          setStartupIndex(0);
          setIsStartupActive(true);
        }
      };

      initStartupPopups();

      // Verificação sanitária da Folha Mensal de Temperatura (ANVISA - RDC 44)
      const checkPendingTempPrint = async () => {
        try {
          const res = await fetch('/api/temperature/check-pending-print');
          if (res.ok) {
            const data = await res.json();
            if (data && data.pending) {
              setTempReminderData(data);
              setIsTempReminderOpen(true);
              return;
            } else if (data && !data.pending) {
              return;
            }
          }
        } catch (err) {
          // Backend offline ou 404
        }

        // Fallback local: se o mês anterior ainda não foi marcado como impresso
        try {
          const now = new Date();
          const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          const prevYm = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
          if (prevYm >= '2026-01') {
            const isPrinted = localStorage.getItem(`belafarma_temp_printed_${prevYm}`);
            if (!isPrinted) {
              const monthNames = [
                'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
              ];
              const prevLabel = `${monthNames[prevDate.getMonth()]} de ${prevDate.getFullYear()}`;
              setTempReminderData({
                pending: true,
                previousMonth: prevYm,
                previousMonthLabel: prevLabel
              });
              setIsTempReminderOpen(true);
            }
          }
        } catch (e) {}
      };
      checkPendingTempPrint();

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

  // --- 🎨 BUDGET THEME — Aplica classe de tema no <html> conforme status do orçamento ---
  useEffect(() => {
    const el = document.documentElement;
    // Remove qualquer tema de orçamento anterior
    el.classList.remove('budget-safe', 'budget-warning', 'budget-danger');
    // Aplica o novo tema (no-budget fica sem classe = neutro)
    if (currentMonthBudgetStatus === 'safe') {
      el.classList.add('budget-safe');
    } else if (currentMonthBudgetStatus === 'warning') {
      el.classList.add('budget-warning');
    } else if (currentMonthBudgetStatus === 'danger') {
      el.classList.add('budget-danger');
    }
  }, [currentMonthBudgetStatus]);


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

  const updateUser = async (userToUpdate: User) => {
    const updated = users.map((u) => (u.id === userToUpdate.id ? userToUpdate : u));
    setUsers(updated);
    createLog(
      "Usuários",
      "Editou Usuário",
      `Nome: ${userToUpdate.name}, Cargo: ${userToUpdate.jobRole || 'N/D'}, Nível: ${userToUpdate.role}`
    );

    try {
      const res = await fetch(`/api/users/${userToUpdate.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(userToUpdate),
      });
      if (!res.ok) {
        throw new Error("Erro ao atualizar usuário no servidor.");
      }
    } catch (e) {
      console.error("Failed to update user:", e);
      fetchData();
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

  if (isPublicRoute) {
    const handleExitPublicRoute = () => {
      try {
        if (
          window.location.hash.includes("promocao") ||
          window.location.hash.includes("aniversario") ||
          window.location.hash.includes("vitrine")
        ) {
          window.location.hash = "";
        }
        if (
          window.location.pathname.includes("promocao") ||
          window.location.pathname.includes("aniversario") ||
          window.location.search.includes("vitrine")
        ) {
          window.history.pushState({}, "", "/");
        }
      } catch (e) {
        console.error("Erro ao sincronizar histórico de rotas:", e);
      }
      setIsPublicRoute(false);
    };

    // Vitrine Pública de Aniversário & Liquidação BelaFarma
    // Mensagem de Impacto Oficial: Mais de 100 itens com preços incríveis e descontos imperdíveis!
    return (
      <VitrineAniversario
        onExit={handleExitPublicRoute}
        initialShowSplash={showSplash}
      />
    );
  }

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
    <div className="flex flex-col md:flex-row h-screen transition-colors duration-500 overflow-hidden" style={{ backgroundColor: 'var(--bf-main-bg)', color: 'var(--bf-main-text)' }}>
      <PwaUpdater />
      <VersionNotifier />
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
        budgetStatus={currentMonthBudgetStatus}
        onOpenMural={() => setIsMuralOpen(true)}
        muralPendingCount={muralPendingCount}
        onOpenVersionModal={() => setIsVersionModalOpen(true)}
      />
      <MobileHeader 
        onOpenSidebar={() => setIsSidebarOpen(true)} 
        onSearch={() => handleNavigate("medication-search")} 
        budgetStatus={currentMonthBudgetStatus}
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
              {currentView === "belaped" && user.role === UserRole.ADM && (
                <BelaPedPortal
                  user={user}
                  theme={theme}
                  onNavigate={handleNavigate}
                />
              )}
              {currentView === "central-compras" && user.role === UserRole.ADM && (
                <CentralCompras
                  user={user}
                  theme={theme}
                  onNavigate={handleNavigate}
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
              {(currentView === "financial" || currentView === "contas-a-pagar") && user.role === UserRole.ADM && (
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
                  initialTab={currentView === 'contas-a-pagar' ? 'payable' : 'overview'}
                />
              )}
              {currentView === "users" && user.role === UserRole.ADM && (
                <Users
                  currentUser={user}
                  users={users}
                  onAdd={addUser}
                  onUpdate={updateUser}
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
              {currentView === 'perdas-avarias' && (
                <LossesManager user={user} theme={theme} />
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
                <StockManagement user={user} theme={theme} />
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
              {currentView === 'temperature-map' && <TemperatureMap />}
              {currentView === 'reposicao-tabela' && (
                <AnaliseReposicao user={user} onNavigate={handleNavigate} />
              )}
              {currentView === 'card-machines' && user.role === UserRole.ADM && (
                <CardMachinesManager user={user} />
              )}
              {currentView === 'price-manager' && user.role === UserRole.ADM && (
                <PriceManager user={user} />
              )}
              {currentView === 'liquidacao-caixa' && user.role === UserRole.ADM && (
                <LiquidacaoCaixa user={user} />
              )}
              {currentView === "settings" && <Settings user={user} limits={monthlyLimits} onSaveLimit={handleSaveLimit} />}
            </>
          )}
        </div>
        <footer className="w-full text-center py-3 text-xs text-slate-500 dark:text-slate-400 font-medium bg-slate-100 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-center gap-2 flex-wrap">
          <span>Desenvolvido por <strong className="font-bold text-slate-700 dark:text-slate-200">Edevaldo Cruz</strong></span>
          <span>•</span>
          <a
            href="https://wa.me/5532988634755?text=Ol%C3%A1%20Edevaldo%2C%20vi%20seu%20contato%20no%20site%20da%20BelaFarma!"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold transition-all border border-emerald-500/30 hover:scale-105 active:scale-95"
            title="Conversar com o desenvolvedor no WhatsApp"
          >
            <span>💬 (32) 98863-4755</span>
          </a>
        </footer>
      </main>

      {/* Barra Superior Unificada de Controle dos Avisos de Abertura */}
      {isStartupActive && startupQueue.length > 0 && (
        <StartupModalManager
          queue={startupQueue}
          currentIndex={startupIndex}
          onNavigate={(newIndex) => setStartupIndex(newIndex)}
          onClose={handleCloseStartup}
        />
      )}

      {/* Modal de Incentivo VW Tera exclusivo para Nayane */}
      {!isMobile && (
        <TeraIncentiveModal
          isOpen={isTeraModalOpen || activeStartupModalId === 'tera'}
          onClose={() => {
            setIsTeraModalOpen(false);
            if (isStartupActive) handleCloseStartup();
          }}
        />
      )}

      {/* Modal de Alerta de Estoque Ideal para Comprador(a) / Nayane */}
      {user && (
        <EstoqueIdealModal
          isOpen={isEstoqueIdealModalOpen || activeStartupModalId === 'estoque-ideal'}
          user={user}
          onClose={() => {
            setIsEstoqueIdealModalOpen(false);
            const hoje = new Date().toISOString().slice(0, 10);
            localStorage.setItem("estoque_ideal_last_date", hoje);
            if (isStartupActive) handleCloseStartup();
          }}
          onNavigateToCompras={() => {
            setIsEstoqueIdealModalOpen(false);
            const hoje = new Date().toISOString().slice(0, 10);
            localStorage.setItem("estoque_ideal_last_date", hoje);
            if (isStartupActive) handleCloseStartup();
            handleNavigate('central-compras');
          }}
        />
      )}

      {/* Modal de Conferência Diária de Maquininha e Provisões para Edevaldo */}
      <CardMachineReconcileModal
        isOpen={isCardMachineModalOpen || activeStartupModalId === 'card-machines'}
        onClose={() => {
          setIsCardMachineModalOpen(false);
          if (isStartupActive) handleCloseStartup();
        }}
        onNavigateToFullView={() => {
          if (isStartupActive) handleCloseStartup();
          handleNavigate('card-machines');
        }}
        userName={user?.name}
        cashClosings={cashClosings}
        onReconcileSuccess={() => {
          fetchData();
        }}
      />

      {/* Modal / Mural de Pendências e Produtos Parados 90d+ */}
      {user && (
        <MuralModal
          isOpen={isMuralOpen || activeStartupModalId === 'mural'}
          onClose={() => {
            setIsMuralOpen(false);
            sessionStorage.setItem("belafarma_mural_dismissed", "true");
            if (isStartupActive) handleCloseStartup();
          }}
          user={user}
          tasks={tasks}
          boletos={boletos}
          pendingReviewCount={pendingReviewCount}
          anvisaAlertCount={anvisaAlertCount}
          onNavigate={(view) => {
            if (isStartupActive) handleCloseStartup();
            handleNavigate(view);
          }}
          onRefreshPending={async () => {
            try {
              const res = await fetch(`/api/mural/pendencias?userId=${encodeURIComponent(user.id)}&userName=${encodeURIComponent(user.name)}`);
              if (res.ok) {
                const data = await res.json();
                if (data.success) {
                  const isAdm = user.role === UserRole.ADM || String(user.role).toUpperCase().includes('ADM') || String(user.role).toUpperCase().includes('GERENTE');
                  const parados = data.totalMinhasPendencias || 0;
                  const variacoes = isAdm ? (data.totalVariacaoPrecos || 0) : 0;
                  setMuralPendingCount(parados + variacoes);
                }
              }
            } catch (e) {}
          }}
        />
      )}

      {/* Botão Flutuante Discreto do Status de Orçamento (Apenas Desktop) */}
      <div className="hidden md:flex fixed bottom-6 right-6 z-[90] flex-col items-end gap-2 group">
        {/* Balão de Status dos 2 Próximos Meses (Exibido no Hover ou se em Alerta) */}
        {currentMonthBudgetStatus !== 'no-budget' && nextMonthsInfo && (
          <div className={`
            hidden group-hover:flex flex-col px-3 py-2 rounded-xl shadow-lg text-[11px] font-bold
            transition-all duration-300 gap-1.5 border pointer-events-none
            ${currentMonthBudgetStatus === 'danger'
              ? 'bg-red-950/95 text-red-100 border-red-800 backdrop-blur'
              : currentMonthBudgetStatus === 'warning'
                ? 'bg-amber-950/95 text-amber-100 border-amber-800 backdrop-blur'
                : 'bg-emerald-950/95 text-emerald-100 border-emerald-800 backdrop-blur'
            }
          `}>
            <div className="text-[9px] uppercase tracking-wider text-slate-400 font-black border-b border-white/10 pb-1 flex items-center justify-between gap-3">
              <span>Previsão 2 Meses</span>
              <span>{budgetEmoji}</span>
            </div>
            {/* Mês 1 */}
            <div className="flex items-center justify-between gap-4">
              <span className="opacity-80">
                {new Date(nextMonthsInfo.m1.year, nextMonthsInfo.m1.month - 1).toLocaleString('pt-BR', { month: 'short' }).toUpperCase()}/{nextMonthsInfo.m1.year}:
              </span>
              <span className={nextMonthsInfo.m1.status === 'danger' ? 'text-red-400 font-black' : nextMonthsInfo.m1.status === 'warning' ? 'text-amber-400' : 'text-emerald-400'}>
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(nextMonthsInfo.m1.spent)} / {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(nextMonthsInfo.m1.limit)}
              </span>
            </div>
            {/* Mês 2 */}
            <div className="flex items-center justify-between gap-4">
              <span className="opacity-80">
                {new Date(nextMonthsInfo.m2.year, nextMonthsInfo.m2.month - 1).toLocaleString('pt-BR', { month: 'short' }).toUpperCase()}/{nextMonthsInfo.m2.year}:
              </span>
              <span className={nextMonthsInfo.m2.status === 'danger' ? 'text-red-400 font-black' : nextMonthsInfo.m2.status === 'warning' ? 'text-amber-400' : 'text-emerald-400'}>
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(nextMonthsInfo.m2.spent)} / {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(nextMonthsInfo.m2.limit)}
              </span>
            </div>
          </div>
        )}

        {/* Botão circular compacto */}
        <button
          onClick={() => setIsBudgetSummaryOpen(true)}
          className={`flex items-center justify-center w-11 h-11 bg-white/90 dark:bg-slate-900/90 backdrop-blur border rounded-full shadow-md transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer ${
            currentMonthBudgetStatus === 'danger'
              ? 'border-red-500/50 text-red-500 hover:border-red-500'
              : currentMonthBudgetStatus === 'warning'
                ? 'border-amber-500/50 text-amber-500 hover:border-amber-500'
                : currentMonthBudgetStatus === 'safe'
                  ? 'border-emerald-500/50 text-emerald-500 hover:border-emerald-500'
                  : 'border-slate-300 dark:border-slate-700 text-slate-400'
          }`}
          title="Ver Resumo de Orçamentos Futuros"
        >
          <span className="text-lg select-none">
            {budgetEmoji}
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

      {/* Modal de Detalhes da Versão do Sistema */}
      <VersionModal
        isOpen={isVersionModalOpen}
        onClose={() => setIsVersionModalOpen(false)}
      />

      {/* Modal de Aviso de Impressão da Folha Mensal de Temperatura */}
      {isTempReminderOpen && tempReminderData && (
        <TemperaturePrintReminderModal
          isOpen={isTempReminderOpen}
          previousMonth={tempReminderData.previousMonth}
          previousMonthLabel={tempReminderData.previousMonthLabel}
          onClose={() => setIsTempReminderOpen(false)}
          onOpenAndPrint={handleOpenAndPrintTemp}
        />
      )}
    </div>
  );
};


export default App;

