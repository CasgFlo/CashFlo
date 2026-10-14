export interface User {
  id: string;
  email: string;
  name: string;
  is_pro: boolean;
  is_admin?: boolean;
  pro_plan?: 'monthly' | 'yearly' | 'lifetime' | null;
  can_manage_subscription?: boolean;
  created_at: string;
  last_login?: string | null;
  login_count?: number;
}

export interface Transaction {
  id: string;
  user_id: string;
  amount: number;
  type: 'expense' | 'income';
  category: string;
  description: string;
  date: string;
  is_recurring: boolean;
  recurring_day?: number | null;
  recurring_parent_id?: string | null;
  recurring_id?: string | null; // the recurring payment it came from
  imported?: boolean; // added from a bank statement / spreadsheet
  receipt_image?: string | null; // only filled when a single transaction is loaded
  has_receipt?: boolean;
  created_at: string;
}

export interface Category {
  id: string;
  user_id: string;
  name: string;
  icon: string;
  color: string;
  type?: 'expense' | 'income';
  is_default: boolean;
}

export interface Goal {
  id: string;
  user_id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  deadline?: string;
  progress: number;
  created_at: string;
}

export interface Budget {
  id: string;
  user_id: string;
  monthly_limit: number;
  category_limits: { [key: string]: number };
  current_month_spending: number;
  category_spending?: { [key: string]: number }; // this month, for categories with a limit
  category_limits_active?: boolean; // limits per category are a Pro feature
}

export interface MonthlyStats {
  total_income: number; // this month
  total_expenses: number; // this month
  balance: number; // all-time balance
  month_balance?: number; // this month's income minus expenses
  expenses_by_category: { [key: string]: number };
  top_categories: Array<{ category: string; amount: number }>;
}

export type Frequency = 'monthly' | 'weekly' | 'yearly';

export interface RecurringPayment {
  id: string;
  name: string;
  amount: number;
  type: 'expense' | 'income';
  category: string;
  frequency: Frequency;
  next_date: string;
  is_subscription: boolean;
  active: boolean;
  monthly_amount: number;
  created_at: string;
}

export interface RecurringList {
  items: RecurringPayment[];
  summary: {
    monthly_expenses: number;
    monthly_income: number;
    subscriptions_monthly: number;
    subscriptions_count: number;
    yearly_expenses: number;
    active_count: number;
  };
  limit: number | null;
  can_add: boolean;
}

/** A payment that repeats in the user's history and could become a recurring payment. */
export interface RecurringSuggestion {
  key: string;
  name: string;
  amount: number;
  frequency: Frequency;
  category: string;
  next_date: string; // YYYY-MM-DD
  is_subscription: boolean;
  occurrences: number;
  last_date: string;
  monthly_amount: number;
  transaction_ids: string[];
}

export interface ImportRow {
  i: number;
  date: string; // YYYY-MM-DD
  amount: number;
  type: 'expense' | 'income';
  description: string;
  category: string;
  duplicate: 'exact' | 'possible' | null;
}

export interface ImportMapping {
  date: number | null;
  amount: number | null;
  debit: number | null;
  credit: number | null;
  description: number[];
  category: number | null;
  type: number | null;
}

export interface ImportPreview {
  session_id: string;
  file_name: string;
  source: string;
  columns: string[];
  sample: string[][];
  mapping: ImportMapping;
  header_found: boolean;
  rows: ImportRow[];
  summary: {
    count: number;
    expenses_count: number;
    expenses_total: number;
    income_count: number;
    income_total: number;
    date_from: string | null;
    date_to: string | null;
    duplicates_exact: number;
    duplicates_possible: number;
  };
  skipped: number;
  foreign_currency: number;
  assumed_expenses: boolean;
  can_commit: boolean;
  imports_used: number;
  import_limit: number | null;
}

export interface ImportHistoryItem {
  id: string;
  created_at: string;
  file_name: string;
  source: string;
  count: number;
  date_from?: string | null;
  date_to?: string | null;
}

export interface Insight {
  icon: string;
  text: string;
  tone: 'positive' | 'negative' | 'neutral';
  kind: string;
}

export interface ReportCategory {
  name: string;
  amount: number;
  share: number;
  prev_amount: number | null;
  change_pct: number | null;
}

export interface MonthlyReport {
  year: number;
  month: number;
  month_name: string;
  month_genitive: string;
  is_current_month: boolean;
  days_in_month: number;
  days_elapsed: number;
  has_data: boolean;
  income: number;
  expenses: number;
  balance: number;
  savings_rate: number | null;
  previous: { income: number; expenses: number; balance: number; comparable_expenses: number; label: string } | null;
  expenses_change_pct: number | null;
  categories: ReportCategory[];
  biggest_expense: { amount: number; category: string; description: string; date: string } | null;
  daily_average: number;
  transaction_count: number;
  fixed_costs_monthly: number;
  subscriptions_monthly: number;
  subscriptions_count: number;
  budget: { limit: number; spent: number; left: number; status: 'ok' | 'near' | 'over' } | null;
  insights: Insight[];
  tip: { category: string; yearly_saving: number; text: string } | null;
  locked: boolean;
  locked_count: number;
}

export const FREE_GOAL_LIMIT = 1;
export const FREE_CUSTOM_CATEGORY_LIMIT = 3;
export const FREE_IMPORT_LIMIT = 1;
export const FREE_RECURRING_LIMIT = 3;
