
export enum OrderStatus {
  PENDENTE = 'Pendente',
  ATRASADO = 'Atrasado',
  CANCELADO = 'Cancelado',
  ENTREGUE = 'Entregue',
  DEVOLVIDO = 'Devolvido'
}

export enum PaymentMethod {
  BOLETO = 'Boleto',
  PIX = 'Pix',
  CARTAO = 'Cartão de Crédito',
  TRANSFERENCIA = 'Transferência Bancária'
}

export enum UserRole {
  ADM = 'Administrador',
  OPERADOR = 'Operador'
}

export enum ProductType {
  GENERICO = 'Genérico',
  SIMILAR = 'Similar',
  PERFUMARIA = 'Perfumaria',
  MARCA = 'Marca (Referência)'
}

export interface Installment {
  id: string;
  value: number;
  dueDate: string;
}

export interface Order {
  id: string;
  orderDate: string;
  distributor: string;
  seller: string;
  totalValue: number;
  arrivalForecast: string;
  status: OrderStatus;
  paymentMonth: string;
  invoiceNumber: string;
  paymentMethod: PaymentMethod;
  receiptDate?: string;
  notes?: string;
  installments?: Installment[];
  boletoFile?: File;
}

export interface ProductShortage {
  id: string;
  productName: string;
  type: ProductType;
  clientInquiry: boolean;
  notes?: string;
  createdAt: string;
  userName: string;
}

export interface CashClosingRecord {
  id: string;
  date: string;
  totalSales: number;
  initialCash: number;
  receivedExtra: number;
  totalDigital: number;
  totalInDrawer: number;
  difference: number;
  safeDeposit: number;
  expenses: number;
  pixDirect: number;
  credit: number;
  debit: number;
  pix: number;
  userName: string;
  totalCrediario: number;
  crediarioList: Array<{ id: string, client: string, val: number, customerId?: string }>;
}

export interface SafeEntry {
  id: string;
  date: string;
  description: string;
  type: 'Entrada' | 'Saída';
  value: number;
  userName: string;
}

export interface DailyRecordEntry {

  id: string;

  date: string;

  expenses: Array<{ id: string, desc: string, val: number }>;

  nonRegistered: Array<{ id: string, desc: string, val: number }>;

  pixDiretoList?: Array<{ id: string, desc: string, val: number }>;

  crediarioList?: Array<{ id: string, client: string, val: number, customerId?: string }>;

  userName: string;

  lancado?: boolean; // Flag to indicate if this record has been processed in cash closing

}



export interface CrediarioRecord {

  id: string;

  date: string;

  client: string;

  value: number;

  userName: string;

}

export interface User {
  id: string;
  name: string;
  role: UserRole;
  accessKey: string;
}

export interface SystemLog {
  id: string;
  timestamp: string;
  userName: string;
  userId: string;
  action: string; // Criou, Editou, Excluiu, Finalizou
  category: 'Pedidos' | 'Faltas' | 'Financeiro' | 'Cofre' | 'Usuários' | 'Sistema' | 'Tarefas';
  details: string;
}

export interface Presentation {
  label: string;
  adult: string;
  pediatric: string;
}

export interface PrescriptionRequirement {
  required: boolean;
  color: string;
  description: string;
}

export interface MedicationInfo {
  name: string;
  activeIngredient: string;
  indication: string;
  presentations: Presentation[];
  prescriptionRequirement: PrescriptionRequirement;
  restrictions: string[];
  contraindications: string;
}

export enum BoletoStatus {
  PENDENTE = 'Pendente',
  PAGO = 'Pago',
  VENCIDO = 'Vencido',
}

export interface Boleto {
  id: string;
  order_id?: string; // Made optional
  supplierName?: string; // New field for free-text supplier
  due_date: string;
  value: number;
  status: BoletoStatus;
  installment_number: number;
  invoice_number?: string;
}

export interface MonthlyLimit {
  month: number;
  year: number;
  limit: number;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  assignedUser: string; // User ID or 'all_users'
  creator: string; // User ID
  priority: 'Muito Urgente' | 'Urgente' | 'Normal' | 'Sem Prioridade';
  status: 'A Fazer' | 'Em Progresso' | 'Concluída' | 'Pausada' | 'Cancelada';
  dueDate: string; // ISO string
  creationDate: string; // ISO string
  color: string; // e.g., 'red', 'orange', 'blue', 'gray'
  
  // Recurrence fields
  recurrence?: { // Optional recurrence object
    type: 'none' | 'daily' | 'weekly' | 'monthly' | 'annually';
    interval?: number; // e.g., every 2 weeks, every 3 months
    daysOfWeek?: number[]; // For weekly recurrence: 0=Sunday, 1=Monday...
    dayOfMonth?: number; // For monthly recurrence
    monthOfYear?: number; // For annually recurrence
    endDate?: string; // ISO string, when recurrence stops
  };
  recurrenceId?: string; // To group tasks generated from the same recurrence rule
  originalDueDate?: string; // Store original due date for recurring tasks if it shifts

  // Annotations
  annotations?: {
    timestamp: string;
    text: string;
    userName: string;
  }[];

  // Admin notification fields
  needsAdminAttention?: boolean; // Flag if user reported a problem
  adminAttentionMessage?: string; // Message from user if reported a problem
  adminResolutionMessage?: string; // NEW: Official response from the creator
  hasAdminResponse?: boolean; // NEW: Flag to notify the requester that there is a reply
}

export interface FixedAccount {
  id: string;
  name: string;
  value: number;
  dueDay: number;
  isActive: boolean;
}

export interface FixedAccountPayment {
  id: string;
  fixedAccountId: string;
  fixedAccountName: string;
  value: number;
  dueDate: string; // YYYY-MM-DD
  month: string; // YYYY-MM
  status: 'Pendente' | 'Pago';
  paidAt?: string; // YYYY-MM-DD
  notes?: string;
}

// CRM Module Types
export interface Customer {
  id: string;
  name: string;           // Required identifier
  nickname?: string;
  cpf?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  creditLimit?: number;   // Credit limit for crediário
  dueDay?: number;        // Due day for payment (1-31)
  createdAt: string;
  updatedAt: string;
}

export interface CustomerDebt {
  id: string;
  customerId: string;
  customerName?: string;  // Populated via JOIN for display
  customerNickname?: string;
  purchaseDate: string;
  description?: string;
  totalValue: number;
  status: 'Pendente' | 'Pago' | 'Atrasado';
  paidAt?: string;
  userName: string;
}

export interface DebtorReport {
  id: string;
  name: string;
  nickname?: string;
  phone?: string;
  dueDay?: number;
  debtCount: number;
  totalOwed: number;
  hasOverdue: number;  // 0 or 1
}

export interface Bug {
  id: string;
  title: string;
  description?: string;
  reporter: string; // User ID
  priority: 'Crítico' | 'Alto' | 'Médio' | 'Baixo';
  status: 'Aberto' | 'Em Análise' | 'Resolvido' | 'Fechado';
  category?: 'Interface' | 'Funcionalidade' | 'Performance' | 'Dados' | 'Outro';
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string; // User ID who resolved
  resolutionNotes?: string;
  screenshots?: string[];
}

export interface FlyeringTask {
  id: string;
  type: 'polyline' | 'polygon';
  coordinates: number[][]; // Array de [lat, lng]
  assignedUserId: string;
  status: 'Pendente' | 'Em Andamento' | 'Concluído';
  color: string; // Cor hexadecimal atribuída ao usuário
  createdAt: string;
  createdBy: string;
  description?: string;
  area?: string; // Nome da área (opcional)
}

export type View = 'dashboard' | 'orders' | 'financial' | 'settings' | 'users' | 'shortages' | 'medication-search' | 'cash-closing' | 'safe' | 'daily-records' | 'logs' | 'checking-account' | 'contas-a-pagar' | 'days-in-debt' | 'crediario-report' | 'task-management' | 'fixed-accounts' | 'customers' | 'debtors-report';
