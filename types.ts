
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
  category: 'Pedidos' | 'Faltas' | 'Financeiro' | 'Cofre' | 'Usuários' | 'Sistema';
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

export type View = 'dashboard' | 'orders' | 'financial' | 'settings' | 'users' | 'shortages' | 'medication-search' | 'cash-closing' | 'safe' | 'daily-records' | 'logs' | 'checking-account';
