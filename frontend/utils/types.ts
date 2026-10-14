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
}

export interface MonthlyStats {
  total_income: number; // this month
  total_expenses: number; // this month
  balance: number; // all-time balance
  month_balance?: number; // this month's income minus expenses
  expenses_by_category: { [key: string]: number };
  top_categories: Array<{ category: string; amount: number }>;
}

export const FREE_GOAL_LIMIT = 1;
export const FREE_CUSTOM_CATEGORY_LIMIT = 3;
