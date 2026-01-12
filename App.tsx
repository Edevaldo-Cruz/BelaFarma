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
import {
  Order,
  View,
  User,
  UserRole,
  OrderStatus,
  ProductShortage,
  SystemLog,
  Boleto,
  BoletoStatus,
  MonthlyLimit,
} from "./types";
import { Loader2 } from "lucide-react";

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
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

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
        alert("Sessão expirada por inatividade.");
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

  const fetchData = async () => {
    setIsLoading(true);
    console.log("fetchData: Iniciando...");
    try {
      const response = await fetch("/api/all-data");
      console.log("fetchData: Resposta da API recebida.", response);
      if (!response.ok) {
        throw new Error(`Network response was not ok: ${response.statusText}`);
      }
      const data = await response.json();
      console.log("fetchData: Dados processados.", data);

      setOrders(data.orders.documents || []);
      setUsers(data.users.documents || []);
      setShortages(data.shortages.documents || []);
      setLogs(data.logs.documents || []);
      setBoletos(data.boletos.documents || []);
      setMonthlyLimits(data.monthlyLimits.documents || []);
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
      await fetch("/api/logs", {
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
      await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(order),
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
      await fetch(`/api/orders/${updatedOrder.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedOrder),
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
      const response = await fetch("/api/monthly-limits", {
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
      await fetch("/api/shortages", {
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
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newUser),
      });
      if (!response.ok) {
        // Handle specific errors, like duplicate access key
        if (response.status === 409) {
          alert("Erro: Chave de acesso já está em uso.");
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
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <Sidebar
        user={user}
        currentView={currentView}
        setView={setCurrentView}
        onLogout={() => {
          createLog("Sistema", "Logout", "Sessão encerrada");
          handleLogout();
        }}
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
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
                <Dashboard user={user} orders={orders} shortages={shortages} />
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
                />
              )}
              {currentView === "cash-closing" && user.role === UserRole.ADM && (
                <CashClosing
                  user={user}
                  onFinish={() => setCurrentView("dashboard")}
                  onLog={(act, det) => createLog("Financeiro", act, det)}
                />
              )}
              {currentView === "safe" && user.role === UserRole.ADM && (
                <Safe
                  user={user}
                  onLog={(act, det) => createLog("Cofre", act, det)}
                />
              )}
              {currentView === "financial" && user.role === UserRole.ADM && (
                <Financial orders={orders} />
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
              {currentView === "contas-a-pagar" && user.role === UserRole.ADM && (
                <ContasAPagar 
                  boletos={boletos} 
                  orders={orders}
                  onUpdateBoletoStatus={updateBoletoStatus} 
                  monthlyLimits={monthlyLimits}
                />
              )}
              {currentView === 'days-in-debt' && user.role === UserRole.ADM && (
                <DaysInDebt boletos={boletos} orders={orders} />
              )}
              {currentView === "settings" && <Settings user={user} limits={monthlyLimits} onSaveLimit={handleSaveLimit} />}
            </>
          )}
        </div>
        <footer className="w-full text-center py-4 text-xs text-slate-400 font-medium absolute bottom-0 left-0">
          <p>Versão Beta - Desenvolvido por Edevaldo Cruz</p>
        </footer>
      </main>
    </div>
  );
};


export default App;
