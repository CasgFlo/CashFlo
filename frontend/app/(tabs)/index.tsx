import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { useTheme, ThemeColors } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../utils/api';
import { Transaction, MonthlyStats, Budget, Category } from '../../utils/types';
import { formatCurrency, formatDayLabel, parseServerDate } from '../../utils/format';
import { makeCategoryLookup, categoryColor } from '../../utils/categories';
import { Card, SectionHeader, ProgressBar, TransactionRow, Fab, EmptyState, tabular, space, radius } from '../../components/ui';

export default function DashboardScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [stats, setStats] = useState<MonthlyStats | null>(null);
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);

  const styles = createStyles(colors);
  const lookup = useMemo(() => makeCategoryLookup(categories), [categories]);

  // Refresh data when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadDashboardData();
    }, [])
  );

  const loadDashboardData = async () => {
    try {
      const [statsRes, transactionsRes, categoriesRes] = await Promise.all([
        api.get('/transactions/stats/monthly'),
        api.get('/transactions?limit=5'),
        api.get('/categories'),
      ]);
      setStats(statsRes.data);
      setRecentTransactions(transactionsRes.data);
      setCategories(categoriesRes.data);
      setLoadError(false);

      try {
        const budgetRes = await api.get('/budget');
        setBudget(budgetRes.data);
      } catch {
        setBudget(null); // budget not set yet
      }
    } catch (error) {
      console.error('Error loading dashboard:', error);
      setLoadError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadDashboardData();
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const income = stats?.total_income || 0;
  const expenses = stats?.total_expenses || 0;
  const monthBalance = stats?.month_balance ?? income - expenses;
  const monthName = format(new Date(), 'LLLL', { locale: pl });

  // Spending split for "where the money goes"
  const spending = Object.entries(stats?.expenses_by_category || {})
    .sort((a, b) => b[1] - a[1])
    .map(([name, amount], index) => ({
      name,
      amount,
      share: expenses > 0 ? amount / expenses : 0,
      color: categoryColor(lookup, name, index),
    }));
  const topSpending = spending.slice(0, 4);

  // Short, factual tips based on this month's numbers
  const tips: { icon: React.ComponentProps<typeof Ionicons>['name']; text: string }[] = [];
  if (spending.length > 0) {
    tips.push({
      icon: 'pie-chart-outline',
      text: `Najwięcej wydajesz na: ${spending[0].name} (${Math.round(spending[0].share * 100)}% wydatków).`,
    });
  }
  if (income > 0 && monthBalance > 0) {
    tips.push({
      icon: 'trending-up-outline',
      text: `W tym miesiącu zostaje Ci ${Math.round((monthBalance / income) * 100)}% przychodów.`,
    });
  } else if (monthBalance < 0) {
    tips.push({
      icon: 'alert-circle-outline',
      text: `W tym miesiącu wydajesz o ${formatCurrency(Math.abs(monthBalance))} więcej, niż zarabiasz.`,
    });
  }
  if (!budget && expenses > 0) {
    tips.push({
      icon: 'wallet-outline',
      text: `Na start możesz ustawić budżet ok. ${formatCurrency(Math.ceil((expenses * 1.1) / 100) * 100, { hideZeroDecimals: true })}.`,
    });
  }

  const budgetUsed = budget && budget.monthly_limit > 0 ? budget.current_month_spending / budget.monthly_limit : 0;
  const budgetLeft = budget ? budget.monthly_limit - budget.current_month_spending : 0;
  const budgetColor = budgetUsed > 0.9 ? colors.error : budgetUsed > 0.7 ? colors.warning : colors.primary;

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space.md }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
      >
        {/* Greeting */}
        <View style={styles.greetingRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.date}>{format(new Date(), 'EEEE, d MMMM', { locale: pl })}</Text>
            <Text style={styles.greeting} numberOfLines={1}>
              {user?.name ? `Cześć, ${user.name.split(' ')[0]}` : 'Cześć!'}
            </Text>
          </View>
          {user?.is_pro ? (
            <View style={styles.proPill}>
              <Ionicons name="star" size={12} color={colors.onAccent} />
              <Text style={styles.proPillText}>PRO</Text>
            </View>
          ) : null}
        </View>

        {loadError ? (
          <Card style={styles.errorCard}>
            <Ionicons name="cloud-offline-outline" size={20} color={colors.error} />
            <Text style={styles.errorText}>Nie udało się pobrać danych. Przeciągnij w dół, aby spróbować ponownie.</Text>
          </Card>
        ) : null}

        {/* Balance */}
        <View style={styles.hero}>
          <Text style={styles.heroLabel}>Twoje saldo</Text>
          <Text style={[styles.heroAmount, tabular]} adjustsFontSizeToFit numberOfLines={1}>
            {formatCurrency(stats?.balance || 0)}
          </Text>
          <View style={styles.heroDivider} />
          <Text style={styles.heroMonth}>W tym miesiącu ({monthName})</Text>
          <View style={styles.heroRow}>
            <View style={styles.heroCol}>
              <View style={styles.heroColLabelRow}>
                <Ionicons name="arrow-down" size={14} color={colors.onPrimary} />
                <Text style={styles.heroColLabel}>Przychody</Text>
              </View>
              <Text style={[styles.heroColValue, tabular]} numberOfLines={1}>{formatCurrency(income)}</Text>
            </View>
            <View style={styles.heroCol}>
              <View style={styles.heroColLabelRow}>
                <Ionicons name="arrow-up" size={14} color={colors.onPrimary} />
                <Text style={styles.heroColLabel}>Wydatki</Text>
              </View>
              <Text style={[styles.heroColValue, tabular]} numberOfLines={1}>{formatCurrency(expenses)}</Text>
            </View>
          </View>
        </View>

        {/* Budget */}
        {budget && budget.monthly_limit > 0 ? (
          <TouchableOpacity activeOpacity={0.8} onPress={() => router.push('/budget/settings')}>
            <Card>
              <View style={styles.rowBetween}>
                <Text style={styles.cardLabel}>Budżet na ten miesiąc</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
              </View>
              <Text style={[styles.budgetLeft, tabular, { color: budgetLeft < 0 ? colors.error : colors.text }]}>
                {budgetLeft < 0 ? `Przekroczony o ${formatCurrency(-budgetLeft)}` : `Zostało ${formatCurrency(budgetLeft)}`}
              </Text>
              <ProgressBar value={budgetUsed} color={budgetColor} />
              <Text style={[styles.muted, tabular, { marginTop: space.sm }]}>
                Wydano {formatCurrency(budget.current_month_spending)} z {formatCurrency(budget.monthly_limit)}
              </Text>
            </Card>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity activeOpacity={0.8} onPress={() => router.push('/budget/settings')}>
            <Card style={styles.promptCard}>
              <View style={styles.promptIcon}>
                <Ionicons name="wallet-outline" size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.promptTitle}>Ustaw miesięczny budżet</Text>
                <Text style={styles.muted}>Zobaczysz, ile zostało do końca miesiąca.</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
            </Card>
          </TouchableOpacity>
        )}

        {/* Where the money goes */}
        {topSpending.length > 0 ? (
          <Card>
            <View style={styles.rowBetween}>
              <Text style={styles.cardLabel}>Gdzie idą pieniądze</Text>
              <TouchableOpacity onPress={() => router.push('/(tabs)/stats')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={styles.link}>Szczegóły</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.stackBar}>
              {spending.map((s) => (
                <View key={s.name} style={{ flex: Math.max(s.share, 0.015), backgroundColor: s.color }} />
              ))}
            </View>
            {topSpending.map((s) => (
              <View key={s.name} style={styles.spendRow}>
                <View style={[styles.dot, { backgroundColor: s.color }]} />
                <Text style={styles.spendName} numberOfLines={1}>{s.name}</Text>
                <Text style={[styles.spendShare, tabular]}>{Math.round(s.share * 100)}%</Text>
                <Text style={[styles.spendAmount, tabular]}>{formatCurrency(s.amount)}</Text>
              </View>
            ))}
          </Card>
        ) : null}

        {/* Tips */}
        {tips.length > 0 ? (
          <Card style={styles.tipsCard}>
            <View style={styles.tipsHeader}>
              <Ionicons name="bulb" size={18} color={colors.warning} />
              <Text style={styles.tipsTitle}>Podpowiedzi</Text>
            </View>
            {tips.map((tip, index) => (
              <View key={index} style={styles.tipRow}>
                <Ionicons name={tip.icon} size={18} color={colors.textSecondary} style={{ marginTop: 1 }} />
                <Text style={styles.tipText}>{tip.text}</Text>
              </View>
            ))}
          </Card>
        ) : null}

        {/* Recent transactions */}
        <SectionHeader
          title="Ostatnie transakcje"
          actionLabel={recentTransactions.length > 0 ? 'Wszystkie' : undefined}
          onAction={() => router.push('/(tabs)/transactions')}
        />
        {recentTransactions.length === 0 ? (
          <EmptyState
            icon="receipt-outline"
            title="Nie masz jeszcze transakcji"
            text="Dodaj pierwszy wydatek albo przychód. Zajmie Ci to kilka sekund."
            actionLabel="Dodaj transakcję"
            onAction={() => router.push('/transaction/add')}
          />
        ) : (
          <Card style={styles.listCard}>
            {recentTransactions.map((t, index) => (
              <View key={t.id}>
                {index > 0 ? <View style={styles.separator} /> : null}
                <TransactionRow
                  transaction={t}
                  category={lookup(t.category, t.type)}
                  showDate
                  dateLabel={formatDayLabel(parseServerDate(t.date))}
                  onPress={() => router.push({ pathname: '/transaction/add', params: { id: t.id } })}
                />
              </View>
            ))}
          </Card>
        )}
      </ScrollView>

      <Fab onPress={() => router.push('/transaction/add')} label="Dodaj transakcję" />
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
    content: { paddingHorizontal: space.lg, paddingBottom: 120 },
    greetingRow: { flexDirection: 'row', alignItems: 'center', marginBottom: space.lg },
    date: { fontSize: 13, color: colors.textSecondary, textTransform: 'capitalize' },
    greeting: { fontSize: 26, fontWeight: '800', color: colors.text, letterSpacing: -0.4, marginTop: 2 },
    proPill: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.accent,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: radius.pill,
    },
    proPillText: { fontSize: 11, fontWeight: '800', color: colors.onAccent, marginLeft: 4, letterSpacing: 0.5 },
    errorCard: { flexDirection: 'row', alignItems: 'center', borderColor: colors.error + '55' },
    errorText: { flex: 1, marginLeft: space.sm, color: colors.text, fontSize: 14 },
    hero: {
      backgroundColor: colors.primary,
      borderRadius: radius.lg,
      padding: space.xl,
      marginBottom: space.md,
    },
    heroLabel: { color: colors.onPrimary, opacity: 0.85, fontSize: 14, fontWeight: '600' },
    heroAmount: { color: colors.onPrimary, fontSize: 38, fontWeight: '800', letterSpacing: -0.8, marginTop: 4 },
    heroDivider: { height: 1, backgroundColor: colors.onPrimary, opacity: 0.18, marginVertical: space.lg },
    heroMonth: { color: colors.onPrimary, opacity: 0.85, fontSize: 13, fontWeight: '600', marginBottom: space.sm },
    heroRow: { flexDirection: 'row' },
    heroCol: { flex: 1 },
    heroColLabelRow: { flexDirection: 'row', alignItems: 'center' },
    heroColLabel: { color: colors.onPrimary, opacity: 0.85, fontSize: 13, marginLeft: 4 },
    heroColValue: { color: colors.onPrimary, fontSize: 18, fontWeight: '700', marginTop: 2 },
    rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    cardLabel: { fontSize: 15, fontWeight: '700', color: colors.text },
    link: { fontSize: 14, fontWeight: '600', color: colors.primary },
    muted: { fontSize: 13, color: colors.textSecondary },
    budgetLeft: { fontSize: 22, fontWeight: '800', marginTop: space.sm, marginBottom: space.md },
    promptCard: { flexDirection: 'row', alignItems: 'center' },
    promptIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: space.md,
    },
    promptTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 2 },
    stackBar: {
      flexDirection: 'row',
      height: 12,
      borderRadius: 6,
      overflow: 'hidden',
      marginTop: space.md,
      marginBottom: space.sm,
      gap: 2,
    },
    spendRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7 },
    dot: { width: 10, height: 10, borderRadius: 5, marginRight: space.sm },
    spendName: { flex: 1, fontSize: 14, color: colors.text },
    spendShare: { width: 44, textAlign: 'right', fontSize: 13, color: colors.textSecondary },
    spendAmount: { minWidth: 96, textAlign: 'right', fontSize: 14, fontWeight: '600', color: colors.text },
    tipsCard: { backgroundColor: colors.surface },
    tipsHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: space.sm },
    tipsTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginLeft: 6 },
    tipRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 5 },
    tipText: { flex: 1, fontSize: 14, color: colors.text, lineHeight: 20, marginLeft: space.sm },
    listCard: { paddingVertical: space.xs },
    separator: { height: 1, backgroundColor: colors.divider, marginLeft: 54 },
  });
