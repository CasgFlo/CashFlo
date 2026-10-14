import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../utils/api';
import { Transaction, MonthlyStats, Budget } from '../../utils/types';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { PieChart } from 'react-native-gifted-charts';

export default function DashboardScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<MonthlyStats | null>(null);
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);

  // Refresh data when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadDashboardData();
    }, [])
  );

  const loadDashboardData = async () => {
    try {
      const [statsRes, transactionsRes] = await Promise.all([
        api.get('/transactions/stats/monthly'),
        api.get('/transactions?limit=5'),
      ]);

      setStats(statsRes.data);
      setRecentTransactions(transactionsRes.data);

      // Try to get budget
      try {
        const budgetRes = await api.get('/budget');
        setBudget(budgetRes.data);
      } catch (err) {
        // Budget not set yet
      }

      // Generate AI suggestions
      generateAISuggestions(statsRes.data, transactionsRes.data);
    } catch (error: any) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const generateAISuggestions = (stats: MonthlyStats, transactions: Transaction[]) => {
    const suggestions: string[] = [];

    // Suggestion 1: Budget recommendation based on spending
    if (stats.total_expenses > 0) {
      const suggestedBudget = Math.ceil(stats.total_expenses * 1.1 / 100) * 100;
      suggestions.push(`Sugerowany budżet: ${suggestedBudget} zł miesięcznie (10% zapasu)`);
    }

    // Suggestion 2: Top spending category
    if (stats.top_categories && stats.top_categories.length > 0) {
      const topCategory = stats.top_categories[0];
      const percentage = (topCategory.amount / stats.total_expenses * 100).toFixed(0);
      suggestions.push(`Najwięcej wydajesz na: ${topCategory.category} (${percentage}%)`);
    }

    // Suggestion 3: Savings potential
    const balance = stats.balance;
    if (balance > 0) {
      const savingsPercent = (balance / stats.total_income * 100).toFixed(0);
      suggestions.push(`Oszczędzasz ${savingsPercent}% swoich przychodów - świetnie!`);
    } else if (balance < 0) {
      suggestions.push(`Wydajesz więcej niż zarabiasz - rozważ cięcie kosztów`);
    }

    setAiSuggestions(suggestions.slice(0, 3));
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadDashboardData();
  };

  const formatCurrency = (amount: number) => {
    return `${amount.toFixed(2)} zł`;
  };

  const getBudgetProgress = () => {
    if (!budget) return 0;
    return (budget.current_month_spending / budget.monthly_limit) * 100;
  };

  const getCategoryColors = () => {
    return ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#FF7F50', '#6C5CE7', '#95A5A6'];
  };

  const getPieData = () => {
    if (!stats || Object.keys(stats.expenses_by_category).length === 0) return [];
    const chartColors = getCategoryColors();
    return Object.entries(stats.expenses_by_category).map(([category, amount], index) => ({
      value: amount,
      label: category,
      color: chartColors[index % chartColors.length],
      text: `${((amount / stats.total_expenses) * 100).toFixed(0)}%`,
    }));
  };

  const styles = createStyles(colors);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const pieData = getPieData();

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.contentContainer, { paddingTop: insets.top + 12 }]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
      }
    >
      {/* Balance Card - on top, immediately visible */}
      <View style={[styles.balanceCard, isDark && styles.balanceCardDark]}>
        <Text style={styles.balanceLabel}>Saldo</Text>
        <Text style={styles.balanceAmount}>{formatCurrency(stats?.balance || 0)}</Text>
        <View style={styles.balanceRow}>
          <View style={styles.balanceItem}>
            <Ionicons name="arrow-down-circle" size={20} color={isDark ? '#66BB6A' : colors.income} />
            <Text style={styles.balanceItemLabel}>Przychody</Text>
            <Text style={[styles.balanceItemAmount, { color: isDark ? '#66BB6A' : colors.income }]}>
              {formatCurrency(stats?.total_income || 0)}
            </Text>
          </View>
          <View style={styles.balanceDivider} />
          <View style={styles.balanceItem}>
            <Ionicons name="arrow-up-circle" size={20} color={isDark ? '#EF5350' : colors.expense} />
            <Text style={styles.balanceItemLabel}>Wydatki</Text>
            <Text style={[styles.balanceItemAmount, { color: isDark ? '#EF5350' : colors.expense }]}>
              {formatCurrency(stats?.total_expenses || 0)}
            </Text>
          </View>
        </View>
      </View>

      {/* Greeting after balance */}
      <View style={styles.header}>
        <Text style={styles.greeting}>Cześć, {user?.name}!</Text>
        <Text style={styles.date}>{format(new Date(), 'EEEE, d MMMM', { locale: pl })}</Text>
      </View>

      {/* Pie Chart - Expenses by Category */}
      {pieData.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Wydatki wg kategorii</Text>
          <View style={styles.chartContainer}>
            <PieChart
              data={pieData}
              radius={80}
              donut
              innerRadius={50}
              innerCircleColor={colors.surface}
              centerLabelComponent={() => (
                <View style={styles.centerLabel}>
                  <Text style={styles.centerLabelAmount}>
                    {formatCurrency(stats?.total_expenses || 0)}
                  </Text>
                  <Text style={styles.centerLabelText}>Wydatki</Text>
                </View>
              )}
            />
          </View>
          {/* Legend */}
          <View style={styles.legend}>
            {pieData.slice(0, 4).map((item, index) => (
              <View key={index} style={styles.legendItem}>
                <View style={[styles.legendColor, { backgroundColor: item.color }]} />
                <Text style={styles.legendLabel} numberOfLines={1}>{item.label}</Text>
                <Text style={styles.legendValue}>{item.text}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Budget Card */}
      {budget && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Budżet miesięczny</Text>
            <Text style={styles.cardValue}>
              {formatCurrency(budget.monthly_limit - budget.current_month_spending)}
            </Text>
          </View>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${Math.min(getBudgetProgress(), 100)}%`,
                  backgroundColor:
                    getBudgetProgress() > 90
                      ? colors.error
                      : getBudgetProgress() > 70
                      ? colors.warning
                      : colors.success,
                },
              ]}
            />
          </View>
          <Text style={styles.budgetText}>
            Wydano {formatCurrency(budget.current_month_spending)} z {formatCurrency(budget.monthly_limit)}
          </Text>
        </View>
      )}

      {/* AI Suggestions */}
      {aiSuggestions.length > 0 && (
        <View style={styles.card}>
          <View style={styles.aiHeader}>
            <Ionicons name="bulb" size={24} color={colors.warning} />
            <Text style={styles.aiTitle}>Inteligentne podpowiedzi</Text>
          </View>
          {aiSuggestions.map((suggestion, index) => (
            <View key={index} style={styles.suggestionItem}>
              <Ionicons 
                name={index === 0 ? 'wallet' : index === 1 ? 'trending-up' : 'checkmark-circle'} 
                size={18} 
                color={colors.warning} 
                style={{ marginRight: 8 }}
              />
              <Text style={styles.suggestionText}>{suggestion}</Text>
            </View>
          ))}
          <TouchableOpacity 
            style={styles.setBudgetButton}
            onPress={() => router.push('/budget/settings')}
          >
            <Text style={styles.setBudgetButtonText}>Ustaw budżet</Text>
            <Ionicons name="arrow-forward" size={16} color={colors.primary} />
          </TouchableOpacity>
        </View>
      )}

      {/* Quick Actions */}
      <View style={styles.quickActions}>
        <TouchableOpacity style={styles.actionButton} onPress={() => router.push('/transaction/add')}>
          <View style={[styles.actionIcon, { backgroundColor: colors.primary }]}>
            <Ionicons name="add" size={28} color="#fff" />
          </View>
          <Text style={styles.actionText}>Dodaj transakcję</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={() => router.push('/goal/add')}>
          <View style={[styles.actionIcon, { backgroundColor: colors.info }]}>
            <Ionicons name="flag" size={24} color="#fff" />
          </View>
          <Text style={styles.actionText}>Nowy cel</Text>
        </TouchableOpacity>
      </View>

      {/* Recent Transactions */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Ostatnie transakcje</Text>
          <TouchableOpacity onPress={() => router.push('/(tabs)/transactions')}>
            <Text style={styles.seeAll}>Zobacz wszystkie</Text>
          </TouchableOpacity>
        </View>

        {recentTransactions.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="wallet-outline" size={48} color={colors.textLight} />
            <Text style={styles.emptyText}>Brak transakcji</Text>
            <Text style={styles.emptySubtext}>Dodaj swoją pierwszą transakcję</Text>
          </View>
        ) : (
          recentTransactions.map((transaction) => (
            <View key={transaction.id} style={styles.transactionItem}>
              <View
                style={[
                  styles.transactionIcon,
                  {
                    backgroundColor:
                      transaction.type === 'income' ? colors.income + '20' : colors.expense + '20',
                  },
                ]}
              >
                <Ionicons
                  name={transaction.type === 'income' ? 'arrow-down' : 'arrow-up'}
                  size={20}
                  color={transaction.type === 'income' ? colors.income : colors.expense}
                />
              </View>
              <View style={styles.transactionDetails}>
                <Text style={styles.transactionCategory}>{transaction.category}</Text>
                <Text style={styles.transactionDescription}>{transaction.description || 'Brak opisu'}</Text>
              </View>
              <View style={styles.transactionRight}>
                <Text
                  style={[
                    styles.transactionAmount,
                    { color: transaction.type === 'income' ? colors.income : colors.expense },
                  ]}
                >
                  {transaction.type === 'income' ? '+' : '-'}
                  {formatCurrency(transaction.amount)}
                </Text>
                <Text style={styles.transactionDate}>
                  {format(new Date(transaction.date), 'd MMM', { locale: pl })}
                </Text>
              </View>
            </View>
          ))
        )}
      </View>
      
      {/* Bottom padding for tab bar */}
      <View style={{ height: 20 }} />
    </ScrollView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  contentContainer: {
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  header: {
    marginBottom: 20,
  },
  greeting: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
  },
  date: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 4,
    textTransform: 'capitalize',
  },
  balanceCard: {
    backgroundColor: colors.primary,
    borderRadius: 20,
    padding: 24,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  balanceCardDark: {
    backgroundColor: '#1A3A35',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  balanceLabel: {
    color: '#fff',
    fontSize: 14,
    opacity: 0.9,
  },
  balanceAmount: {
    color: '#fff',
    fontSize: 40,
    fontWeight: 'bold',
    marginTop: 4,
    marginBottom: 24,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  balanceItem: {
    flex: 1,
    alignItems: 'center',
  },
  balanceDivider: {
    width: 1,
    backgroundColor: '#fff',
    opacity: 0.3,
    marginHorizontal: 16,
  },
  balanceItemLabel: {
    color: '#fff',
    fontSize: 12,
    marginTop: 6,
    opacity: 0.9,
  },
  balanceItemAmount: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 4,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
  },
  cardValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.primary,
  },
  progressBar: {
    height: 10,
    backgroundColor: colors.border,
    borderRadius: 5,
    overflow: 'hidden',
    marginBottom: 10,
  },
  progressFill: {
    height: '100%',
    borderRadius: 5,
  },
  budgetText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  chartContainer: {
    alignItems: 'center',
    marginBottom: 12,
  },
  centerLabel: {
    alignItems: 'center',
  },
  centerLabelAmount: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.text,
  },
  centerLabelText: {
    fontSize: 10,
    color: colors.textSecondary,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '48%',
    marginBottom: 8,
  },
  legendColor: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 6,
  },
  legendLabel: {
    flex: 1,
    fontSize: 12,
    color: colors.text,
  },
  legendValue: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 24,
    gap: 24,
  },
  actionButton: {
    alignItems: 'center',
  },
  actionIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  actionText: {
    fontSize: 12,
    color: colors.text,
    fontWeight: '600',
  },
  section: {
    marginBottom: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  seeAll: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    backgroundColor: colors.surface,
    borderRadius: 16,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.textLight,
    marginTop: 4,
  },
  transactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: 14,
    borderRadius: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  transactionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  transactionDetails: {
    flex: 1,
  },
  transactionCategory: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  transactionDescription: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  transactionRight: {
    alignItems: 'flex-end',
  },
  transactionAmount: {
    fontSize: 16,
    fontWeight: '700',
  },
  transactionDate: {
    fontSize: 11,
    color: colors.textLight,
    marginTop: 2,
  },
  aiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  aiTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    marginLeft: 10,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.warning + '15',
    borderLeftWidth: 3,
    borderLeftColor: colors.warning,
    padding: 12,
    borderRadius: 10,
    marginBottom: 10,
  },
  suggestionText: {
    flex: 1,
    fontSize: 13,
    color: colors.text,
    lineHeight: 18,
  },
  setBudgetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.primary,
    borderStyle: 'dashed',
    marginTop: 6,
  },
  setBudgetButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
    marginRight: 8,
  },
});
