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
import { CheckingAccount } from "./components/CheckingAccount";
import { ContasAPagar } from "./components/ContasAPagar";
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

const LOGOUT_TIME = 15 * 60 * 1000;

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [currentView, setCurrentView] = useState<View>("dashboard");
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
    const saved = localStorage.getItem('belafarma_theme');
    return (saved as 'light' | 'dark') || 'light';
  });
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const { addToast } = useToast();

  const logoutTimerRef = useRef<number | null>(null);

  const handleLogout = () => {
    setUser(null);
    setCurrentView("dashboard");
    localStorage.removeItem("belafarma_session_user");
    if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
  };

  const resetLogoutTimer = () => {
    if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
    if (user) {
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

      return () => {
        events.forEach((event) => window.removeEventListener(event, reset));
        if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
      };
    }
  }, [user]);

  useEffect(() => {
    localStorage.setItem('belafarma_theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

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
          formData.append(key, order[key]);
        }
      });

      await fetch('/api/orders', {
        method: "POST",
        body: formData,
      });
    } catch (e) {
      console.error("Failed to add order:", e);
      // TODO: Implement rollback logic
    }
  };

  const updateOrder = async (updatedOrder: Order) => {
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
          formData.append(key, updatedOrder[key]);
        }
      });

      await fetch(`/api/orders/${updatedOrder.id}`, {
        method: "PUT",
        body: formData,
      });
    } catch (e) {
      console.error("Failed to update order:", e);
      // TODO: Implement rollback logic
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
        body: JSON.stringify({ recordIds }),
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
          createLog("Sistema", "Login", "Acesso efetuado");
        }}
      />
    );

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-300 overflow-hidden">
      <Sidebar
        user={user}
        currentView={currentView}
        setView={setCurrentView}
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
      />
      <main className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="max-w-7xl mx-auto pb-10">
          {isLoading ? (
            <div className="h-[60vh] flex flex-col items-center justify-center gap-4">
              <Loader2 className="w-10 h-10 text-red-600 animate-spin" />
            </div>
          ) : (
            <>
              {currentView === "dashboard" && (
                <Dashboard user={user} orders={orders} shortages={shortages} cashClosings={cashClosings} boletos={boletos} fixedAccounts={fixedAccounts} />
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
                />
              )}
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
                  onFinish={() => setCurrentView("dashboard")}
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
                  onNavigate={setCurrentView}
                  onViewTask={(task) => {
                    setSelectedTask(task);
                    setCurrentView('task-management');
                  }}
                />
              )}
              {currentView === "settings" && <Settings user={user} limits={monthlyLimits} onSaveLimit={handleSaveLimit} />}
            </>
          )}
        </div>
        <footer className="w-full text-center py-4 text-xs text-slate-400 font-medium absolute bottom-0 left-0 bg-slate-100">
          <p>Versão Beta - Desenvolvido por Edevaldo Cruz</p>
        </footer>
      </main>
    </div>
  );
};


export default App;

