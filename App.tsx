import React, { useState, useEffect, useRef } from "react";
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
import { FogueteAmareloMonitor } from "./components/FogueteAmareloMonitor";
import { InvoiceList } from "./components/InvoiceList";
import { ConsignadosManager } from "./components/ConsignadosManager";
import { IFoodControl } from "./components/iFoodControl";
import { NotificationsPage } from "./components/NotificationsPage";
import { MessagingCenter } from "./components/MessagingCenter";
import AIPortal from "./components/AIPortal";
import { FinancialHealthAdvisor } from "./components/FinancialHealthAdvisor";
import { RadioManager } from "./components/RadioManager";
import { WhatsAppCRM } from "./components/WhatsAppCRM";
import { WhatsAppVendas } from "./components/WhatsAppVendas";
import { TeraIncentiveModal } from "./components/TeraIncentiveModal";
import { PixGenerator } from "./components/PixGenerator";
import { EtiquetasManager } from "./components/EtiquetasManager";
import { ComprasLive } from "./components/ComprasLive";
import { StockManagement } from "./components/StockManagement";
import SuppliersManager from "./components/SuppliersManager";
import { PwaUpdater } from "./components/PwaUpdater";
import { MobileHeader } from "./components/MobileHeader";
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
} from "./types";
import { Loader2 } from "lucide-react";
import { useToast } from "./components/ToastContext";
import { trackViewUsage } from "./utils";

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

  const [currentView, setCurrentView] = useState<View>(() => {
    const isPixOnly = new URLSearchParams(window.location.search).get('app') === 'pix';
    return isPixOnly ? 'pix' : 'dashboard';
  });
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
  const { addToast } = useToast();
  const [isBudgetSummaryOpen, setIsBudgetSummaryOpen] = useState(true);

  const handleCloseBudgetSummary = () => {
    setIsBudgetSummaryOpen(false);
  };

  // Cálculos do Orçamento do Mês Atual para o Botão Flutuante e Tema
  const { isBudgetBusted, budgetEmoji, currentMonthBudgetStatus } = useMemo(() => {
    const today = new Date();
    const currentMonthIndex = today.getMonth(); // 0-11
    const currentYear = today.getFullYear();

    const currentMonthBoletos = boletos.filter(b => {
      const d = new Date(b.due_date + 'T00:00:00');
      return d.getFullYear() === currentYear && d.getMonth() === currentMonthIndex;
    });

    const currentMonthBoletosTotal = currentMonthBoletos.reduce((sum, b) => sum + b.value, 0);
    
    const currentMonthLimitObj = monthlyLimits.find(
      l => l.month === (currentMonthIndex + 1) && l.year === currentYear
    );
    const currentMonthBudgetLimit = currentMonthLimitObj ? currentMonthLimitObj.limit : 0;

    let status: 'safe' | 'warning' | 'danger' | 'no-budget' = 'no-budget';
    let emoji = '🤍';
    let isBusted = false;

    if (currentMonthBudgetLimit > 0) {
      const percentUsed = (currentMonthBoletosTotal / currentMonthBudgetLimit) * 100;
      isBusted = percentUsed > 100;
      if (percentUsed < 80) {
        status = 'safe';
        emoji = '💚';
      } else if (percentUsed <= 100) {
        status = 'warning';
        emoji = '💛';
      } else {
        status = 'danger';
        emoji = '💔';
      }
    }

    return {
      isBudgetBusted: isBusted,
      budgetEmoji: emoji,
      currentMonthBudgetStatus: status
    };
  }, [boletos, monthlyLimits]);

  const logoutTimerRef = useRef<number | null>(null);
  const currentViewRef = useRef<View>("dashboard");
  const isPixOnly = new URLSearchParams(window.location.search).get('app') === 'pix';

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

      return () => {
        events.forEach((event) => window.removeEventListener(event, reset));
        if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
      };
    }
  }, [user, isMobile]);

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
      const response = await fetch('/api/all-data');
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



  if (user && isPixOnly) {
    return (
      <div className="h-screen w-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-300 overflow-hidden p-0 m-0">
        <PwaUpdater />
        <main className="h-full w-full overflow-y-auto overflow-x-hidden p-2 md:p-6">
          <PixGenerator 
            user={user}
            onNavigate={handleNavigate}
            isPixOnly={true}
            onLogout={handleLogout}
          />
        </main>
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
              {currentView === 'task-management' && (
                <TaskManagementPage 
                  user={user} 
                  users={users} 
                  onLog={(act, det) => createLog("Tarefas", act, det)} 
                  onRefreshTasks={fetchData}
                  initialSelectedTask={selectedTask}
                  onClearSelection={() => setSelectedTask(null)}
                />
              )}
              {currentView === 'customers' && (
                <CustomersPage 
                  user={user} 
                  onLog={(act, det) => createLog('Sistema', act, det)}
                />
              )}
              {currentView === 'days-in-debt' && user.role === UserRole.ADM && (
                <DaysInDebt boletos={boletos} orders={orders} fixedAccounts={fixedAccounts} cashClosings={cashClosings} />
              )}
              {currentView === 'debtors-report' && user.role === UserRole.ADM && (
                <DebtorsReport />
              )}
              {currentView === 'backups' && user.role === UserRole.ADM && (
                <BackupManager />
              )}
              {currentView === 'foguete-amarelo' && user.role === UserRole.ADM && (
                <FogueteAmareloMonitor />
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
              {currentView === 'radio-manager' && user.role === UserRole.ADM && (
                <RadioManager />
              )}
              {currentView === 'whatsapp-crm' && user.role === UserRole.ADM && (
                <WhatsAppCRM />
              )}
              {currentView === 'whatsapp-vendas' && (
                <WhatsAppVendas />
              )}
              {currentView === 'pix' && (
                <PixGenerator 
                  user={user}
                  onNavigate={handleNavigate}
                />
              )}
              {currentView === 'pix-history' && (
                <PixGenerator 
                  user={user}
                  onNavigate={handleNavigate}
                  defaultShowExtrato={true}
                />
              )}
              {currentView === 'labels' && <EtiquetasManager user={user} />}
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

      {/* Botão Flutuante do Status de Orçamento (Canto Inferior Esquerdo) */}
      <button
        onClick={() => setIsBudgetSummaryOpen(true)}
        className={`fixed bottom-6 left-6 z-[90] flex items-center justify-center w-14 h-14 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-full shadow-2xl transition-all duration-300 hover:scale-110 active:scale-95 group`}
        title="Ver Painel de Orçamentos"
      >
        <span className="text-2xl relative select-none flex items-center justify-center">
          {budgetEmoji}
          {(currentMonthBudgetStatus === 'warning' || currentMonthBudgetStatus === 'danger') && (
            <span className={`absolute -inset-1 rounded-full animate-ping border-2 ${currentMonthBudgetStatus === 'danger' ? 'border-red-500' : 'border-amber-500'} opacity-75`} />
          )}
        </span>
      </button>

      {/* Pop-up de Somas de Boletos e Orçamentos por Mês */}
      {isBudgetSummaryOpen && (
        <BoletoBudgetSummaryModal
          boletos={boletos}
          monthlyLimits={monthlyLimits}
          onClose={handleCloseBudgetSummary}
        />
      )}
    </div>
  );
};


export default App;

