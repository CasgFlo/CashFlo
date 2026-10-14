import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PieChart } from 'react-native-gifted-charts';
import { useTheme, ThemeColors } from '../../contexts/ThemeContext';
import api from '../../utils/api';
import { MonthlyStats, Category } from '../../utils/types';
import { formatCurrency, formatMonthLabel } from '../../utils/format';
import { makeCategoryLookup, categoryColor } from '../../utils/categories';
import { LargeTitle, Card, ProgressBar, EmptyState, tabular, space, radius } from '../../components/ui';

export default function StatsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const now = new Date();
  const [period, setPeriod] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [stats, setStats] = useState<MonthlyStats | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);

  const styles = createStyles(colors);
  const lookup = useMemo(() => makeCategoryLookup(categories), [categories]);
  const isCurrentMonth = period.year === now.getFullYear() && period.month === now.getMonth() + 1;

  const loadStats = async (year: number, month: number) => {
    try {
      const [statsRes, categoriesRes] = await Promise.all([
        api.get(`/transactions/stats/monthly?year=${year}&month=${month}`),
        api.get('/categories'),
      ]);
      setStats(statsRes.data);
      setCategories(categoriesRes.data);
      setLoadError(false);
    } catch (error) {
      console.error('Error loading stats:', error);
      setLoadError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadStats(period.year, period.month);
    }, [period.year, period.month])
  );

  const shiftMonth = (delta: number) => {
    let month = period.month + delta;
    let year = period.year;
    if (month < 1) {
      month = 12;
      year -= 1;
    } else if (month > 12) {
      month = 1;
      year += 1;
    }
    setLoading(true);
    setPeriod({ year, month });
  };

  const income = stats?.total_income || 0;
  const expenses = stats?.total_expenses || 0;
  const monthBalance = stats?.month_balance ?? income - expenses;

  const spending = Object.entries(stats?.expenses_by_category || {})
    .sort((a, b) => b[1] - a[1])
    .map(([name, amount], index) => ({
      name,
      amount,
      share: expenses > 0 ? amount / expenses : 0,
      color: categoryColor(lookup, name, index),
      icon: (lookup(name, 'expense')?.icon || 'ellipse') as React.ComponentProps<typeof Ionicons>['name'],
    }));

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + space.sm }]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            loadStats(period.year, period.month);
          }}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
    >
      <LargeTitle title="Statystyki" />

      {/* Month switcher */}
      <View style={styles.monthSwitcher}>
        <TouchableOpacity style={styles.monthButton} onPress={() => shiftMonth(-1)} accessibilityLabel="Poprzedni miesiąc">
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.monthLabel}>{formatMonthLabel(period.year, period.month)}</Text>
        <TouchableOpacity
          style={[styles.monthButton, isCurrentMonth && { opacity: 0.35 }]}
          onPress={() => shiftMonth(1)}
          disabled={isCurrentMonth}
          accessibilityLabel="Następny miesiąc"
        >
          <Ionicons name="chevron-forward" size={20} color={colors.text} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: space.xxl }} color={colors.primary} />
      ) : loadError ? (
        <EmptyState icon="cloud-offline-outline" title="Nie udało się pobrać statystyk" text="Przeciągnij w dół, aby spróbować ponownie." />
      ) : (
        <>
          {/* Summary */}
          <View style={styles.summaryRow}>
            <Card style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Przychody</Text>
              <Text style={[styles.summaryValue, tabular, { color: colors.income }]} numberOfLines={1} adjustsFontSizeToFit>
                {formatCurrency(income)}
              </Text>
            </Card>
            <Card style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Wydatki</Text>
              <Text style={[styles.summaryValue, tabular, { color: colors.expense }]} numberOfLines={1} adjustsFontSizeToFit>
                {formatCurrency(expenses)}
              </Text>
            </Card>
          </View>
          <Card style={styles.balanceCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.summaryLabel}>Bilans miesiąca</Text>
              <Text style={styles.balanceHint}>Przychody minus wydatki</Text>
            </View>
            <Text style={[styles.balanceValue, tabular, { color: monthBalance >= 0 ? colors.income : colors.expense }]}>
              {monthBalance >= 0 ? '+' : '−'}
              {formatCurrency(Math.abs(monthBalance))}
            </Text>
          </Card>

          {spending.length === 0 ? (
            <EmptyState
              icon="pie-chart-outline"
              title="Brak wydatków w tym miesiącu"
              text="Gdy dodasz wydatki, zobaczysz tu, na co idzie najwięcej pieniędzy."
            />
          ) : (
            <Card>
              <Text style={styles.cardTitle}>Wydatki według kategorii</Text>
              <View style={styles.chart}>
                <PieChart
                  data={spending.map((s) => ({ value: s.amount, color: s.color }))}
                  donut
                  radius={96}
                  innerRadius={66}
                  innerCircleColor={colors.surface}
                  centerLabelComponent={() => (
                    <View style={{ alignItems: 'center' }}>
                      <Text style={[styles.centerAmount, tabular]}>{formatCurrency(expenses, { hideZeroDecimals: true })}</Text>
                      <Text style={styles.centerLabel}>wydatki</Text>
                    </View>
                  )}
                />
              </View>

              {spending.map((s) => (
                <View key={s.name} style={styles.categoryRow}>
                  <View style={[styles.categoryIcon, { backgroundColor: s.color + '1F' }]}>
                    <Ionicons name={s.icon} size={16} color={s.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.categoryTop}>
                      <Text style={styles.categoryName} numberOfLines={1}>{s.name}</Text>
                      <Text style={[styles.categoryAmount, tabular]}>{formatCurrency(s.amount)}</Text>
                    </View>
                    <View style={styles.categoryBottom}>
                      <View style={{ flex: 1 }}>
                        <ProgressBar value={s.share} color={s.color} />
                      </View>
                      <Text style={[styles.categoryShare, tabular]}>{Math.round(s.share * 100)}%</Text>
                    </View>
                  </View>
                </View>
              ))}
            </Card>
          )}
        </>
      )}
    </ScrollView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    content: { paddingHorizontal: space.lg, paddingBottom: 48 },
    monthSwitcher: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: radius.md,
      padding: 4,
      marginBottom: space.md,
    },
    monthButton: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    monthLabel: { fontSize: 16, fontWeight: '700', color: colors.text },
    summaryRow: { flexDirection: 'row', gap: space.md },
    summaryCard: { flex: 1 },
    summaryLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
    summaryValue: { fontSize: 20, fontWeight: '800', marginTop: 4 },
    balanceCard: { flexDirection: 'row', alignItems: 'center' },
    balanceHint: { fontSize: 12, color: colors.textLight, marginTop: 2 },
    balanceValue: { fontSize: 20, fontWeight: '800' },
    cardTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
    chart: { alignItems: 'center', marginVertical: space.lg },
    centerAmount: { fontSize: 16, fontWeight: '800', color: colors.text },
    centerLabel: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
    categoryRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.sm },
    categoryIcon: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: space.md,
    },
    categoryTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    categoryName: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text, marginRight: space.sm },
    categoryAmount: { fontSize: 14, fontWeight: '700', color: colors.text },
    categoryBottom: { flexDirection: 'row', alignItems: 'center' },
    categoryShare: { width: 40, textAlign: 'right', fontSize: 12, color: colors.textSecondary },
  });
