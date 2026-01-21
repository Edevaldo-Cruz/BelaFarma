import React, { useState, useEffect } from 'react';
import { User, Task } from '../types';
import { LayoutDashboard, CheckCircle2, List, Clock, AlertTriangle } from 'lucide-react';

interface AdminTaskDashboardProps {
  user: User;
}

export const AdminTaskDashboard: React.FC<AdminTaskDashboardProps> = ({ user }) => {
  const [metrics, setMetrics] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMetrics = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/tasks/dashboard-metrics?userId=${user.id}&userRole=${user.role}`);
        if (!response.ok) {
          throw new Error('Failed to fetch dashboard metrics.');
        }
        const data = await response.json();
        setMetrics(data);
      } catch (err: any) {
        console.error('Error fetching dashboard metrics:', err);
        setError(err.message || 'Erro ao carregar as métricas do dashboard.');
      } finally {
        setLoading(false);
      }
    };

    if (user.role === 'Administrador') {
      fetchMetrics();
    } else {
      setError('Acesso negado. Apenas administradores podem ver o dashboard de tarefas.');
      setLoading(false);
    }
  }, [user]);

  if (loading) {
    return <div className="text-center py-8 text-slate-500">Carregando métricas do dashboard...</div>;
  }

  if (error) {
    return <div className="text-center py-8 text-red-600 font-bold">{error}</div>;
  }

  if (!metrics) {
    return <div className="text-center py-8 text-slate-500">Nenhum dado de métrica disponível.</div>;
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <h2 className="text-2xl font-black text-slate-900 flex items-center gap-3">
        <LayoutDashboard className="w-7 h-7" /> Dashboard de Tarefas (Admin)
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard icon={<List />} title="Total de Tarefas" value={metrics.totalTasks} color="slate" />
        <MetricCard icon={<CheckCircle2 />} title="Tarefas Concluídas" value={metrics.completedTasks} color="emerald" />
        <MetricCard icon={<Clock />} title="Tarefas Em Progresso" value={metrics.inProgressTasks} color="blue" />
        <MetricCard icon={<AlertTriangle />} title="Tarefas Atrasadas" value={metrics.overdueTasks} color="red" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <MetricsChart title="Tarefas por Prioridade" data={metrics.tasksByPriority} dataKey="priority" valueKey="count" />
        <MetricsChart title="Tarefas por Status" data={metrics.tasksByStatus} dataKey="status" valueKey="count" />
      </div>
    </div>
  );
};

// Helper component for Metric Cards
const MetricCard: React.FC<{ icon: React.ReactNode; title: string; value: number; color: string }> = ({ icon, title, value, color }) => (
  <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
    <div className={`p-3 rounded-xl w-fit mb-4 text-${color}-600 bg-${color}-50`}>
      {icon}
    </div>
    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{title}</p>
    <p className="text-2xl font-black text-slate-900 mt-1">{value}</p>
  </div>
);

// Helper component for simple bar charts (can be replaced with Recharts later)
const MetricsChart: React.FC<{ title: string; data: any[]; dataKey: string; valueKey: string }> = ({ title, data, dataKey, valueKey }) => (
  <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
    <h3 className="text-lg font-bold text-slate-800 mb-4">{title}</h3>
    <div className="space-y-2">
      {data.map((item, index) => (
        <div key={index} className="flex items-center gap-3">
          <span className="text-sm font-medium text-slate-600 w-28 truncate">{item[dataKey]}</span>
          <div className="flex-1 bg-slate-100 rounded-full h-3">
            <div 
              className="bg-red-600 h-full rounded-full" 
              style={{ width: `${(item[valueKey] / data.reduce((sum, i) => sum + i[valueKey], 0)) * 100}%` }}
            ></div>
          </div>
          <span className="text-sm font-bold text-slate-800">{item[valueKey]}</span>
        </div>
      ))}
    </div>
  </div>
);
