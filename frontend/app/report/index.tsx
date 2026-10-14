import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, ThemeColors } from '../../contexts/ThemeContext';
import api from '../../utils/api';
import { Category, MonthlyReport } from '../../utils/types';
import { formatChange, formatCurrency, formatMonthLabel, parseDay, formatShortDate } from '../../utils/format';
import { makeCategoryLookup, categoryColor } from '../../utils/categories';
import { ScreenHeader, Card, EmptyState, InsightRow, LockedCard, ProgressBar, tabular, space, radius } from '../../components/ui';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const conclusionsWord = (n: number) => (n === 1 ? 'wniosek' : n >= 2 && n <= 4 ? 'wnioski' : 'wniosków');

export default function MonthlyReportScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const params = useLocalSearchParams<{ year?: string; month?: string }>();

  const now = new Date();
  const initialYear = Number(params.year) || now.getFullYear();
  const initialMonth = Number(params.month) || now.getMonth() + 1;
  const [period, setPeriod] = useState({ year: initialYear, month: initialMonth });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [report, setReport] = useState<MonthlyReport | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const lookup = useMemo(() => makeCategoryLookup(categories), [categories]);
  const isCurrentMonth = period.year === now.getFullYear() && period.month === now.getMonth() + 1;

  const load = async (year: number, month: number) => {
    try {
      const [reportRes, categoriesRes] = await Promise.all([
        api.get(`/reports/monthly?year=${year}&month=${month}`),
        api.get('/categories'),
      ]);
      setReport(reportRes.data);
      setCategories(categoriesRes.data);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      load(period.year, period.month);
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

  const openPro = () => router.push('/pro/upgrade');
  const r = report;
  const savingsPct = r && r.savings_rate !== null ? Math.round(r.savings_rate * 100) : null;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xxl }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load(period.year, period.month);
            }}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <ScreenHeader title="Podsumowanie miesiąca" onBack={() => router.back()} />

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
        ) : loadError || !r ? (
          <EmptyState icon="cloud-offline-outline" title="Nie udało się pobrać podsumowania" text="Przeciągnij w dół, aby spróbować ponownie." />
        ) : !r.has_data ? (
          <EmptyState
            icon="document-text-outline"
            title="Brak transakcji w tym miesiącu"
            text="Dodaj wydatki albo zaimportuj historię z banku, a pokażemy tu, co się zmieniło i gdzie można zaoszczędzić."
            actionLabel="Importuj z banku lub Excela"
            onAction={() => router.push('/import')}
          />
        ) : (
          <>
            {/* Totals */}
            <View style={styles.hero}>
              <Text style={styles.heroLabel}>
                {r.is_current_month ? `Bilans do dziś (${r.days_elapsed} z ${r.days_in_month} dni)` : 'Bilans miesiąca'}
              </Text>
              <Text style={[styles.heroAmount, tabular]} adjustsFontSizeToFit numberOfLines={1}>
                {r.balance >= 0 ? '+' : '−'}
                {formatCurrency(Math.abs(r.balance))}
              </Text>
              {savingsPct !== null ? (
                <Text style={styles.heroSub}>
                  {r.balance >= 0 ? `Zostało ${savingsPct}% przychodów` : 'Wydatki wyższe niż przychody'}
                </Text>
              ) : null}
              <View style={styles.heroDivider} />
              <View style={styles.heroRow}>
                <View style={styles.heroCol}>
                  <Text style={styles.heroColLabel}>Przychody</Text>
                  <Text style={[styles.heroColValue, tabular]} numberOfLines={1}>{formatCurrency(r.income)}</Text>
                </View>
                <View style={styles.heroCol}>
                  <Text style={styles.heroColLabel}>Wydatki</Text>
                  <Text style={[styles.heroColValue, tabular]} numberOfLines={1}>{formatCurrency(r.expenses)}</Text>
                  {r.expenses_change_pct !== null && r.previous ? (
                    <Text style={styles.heroChange}>
                      {formatChange(r.expenses_change_pct)} niż {r.is_current_month ? 'przed miesiącem' : r.previous.label}
                    </Text>
                  ) : null}
                </View>
              </View>
            </View>

            {/* Conclusions */}
            {r.insights.length > 0 ? (
              <Card>
                <View style={styles.cardHeader}>
                  <Ionicons name="bulb" size={18} color={colors.warning} />
                  <Text style={styles.cardTitle}>Najważniejsze wnioski</Text>
                </View>
                {r.insights.map((i, index) => (
                  <InsightRow key={index} icon={i.icon} text={i.text} tone={i.tone} divider={index > 0} />
                ))}
              </Card>
            ) : null}

            {r.tip ? (
              <Card style={styles.tipCard}>
                <View style={styles.cardHeader}>
                  <Ionicons name="sparkles" size={18} color={colors.primary} />
                  <Text style={styles.cardTitle}>Gdzie można zaoszczędzić</Text>
                </View>
                <Text style={styles.tipText}>{r.tip.text}</Text>
              </Card>
            ) : null}

            {r.locked && r.locked_count > 0 ? (
              <LockedCard
                title={`Jeszcze ${r.locked_count} ${conclusionsWord(r.locked_count)} w pełnym podsumowaniu`}
                text="Porównanie z poprzednim miesiącem dla każdej kategorii, podpowiedź, ile możesz odłożyć w rok, i wszystkie wnioski. W CashFlo Pro."
                onPress={openPro}
              />
            ) : null}

            {/* Categories */}
            {r.categories.length > 0 ? (
              <Card>
                <Text style={styles.cardTitleAlone}>Na co poszły pieniądze</Text>
                {r.categories.map((c, index) => {
                  const color = categoryColor(lookup, c.name, index);
                  const icon = (lookup(c.name, 'expense')?.icon || 'ellipse') as IconName;
                  const change = c.change_pct;
                  const showChange = change !== null && c.prev_amount !== null && c.prev_amount > 0 && Math.abs(change) >= 0.05;
                  return (
                    <View key={c.name} style={styles.categoryRow}>
                      <View style={[styles.categoryIcon, { backgroundColor: color + '1F' }]}>
                        <Ionicons name={icon} size={16} color={color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={styles.categoryTop}>
                          <Text style={styles.categoryName} numberOfLines={1}>{c.name}</Text>
                          {showChange ? (
                            <Text style={[styles.changeBadge, { color: change! > 0 ? colors.expense : colors.income }]}>
                              {formatChange(change!)}
                            </Text>
                          ) : null}
                          <Text style={[styles.categoryAmount, tabular]}>{formatCurrency(c.amount)}</Text>
                        </View>
                        <ProgressBar value={c.share} color={color} />
                      </View>
                    </View>
                  );
                })}
              </Card>
            ) : null}

            {/* Numbers */}
            <Card>
              <Text style={styles.cardTitleAlone}>W liczbach</Text>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Średnio dziennie</Text>
                <Text style={[styles.statValue, tabular]}>{formatCurrency(r.daily_average)}</Text>
              </View>
              <View style={[styles.statRow, styles.divider]}>
                <Text style={styles.statLabel}>Liczba transakcji</Text>
                <Text style={[styles.statValue, tabular]}>{r.transaction_count}</Text>
              </View>
              {r.biggest_expense ? (
                <View style={[styles.statRow, styles.divider]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.statLabel}>Największy wydatek</Text>
                    <Text style={styles.statHint} numberOfLines={1}>
                      {r.biggest_expense.description || r.biggest_expense.category} · {formatShortDate(parseDay(r.biggest_expense.date))}
                    </Text>
                  </View>
                  <Text style={[styles.statValue, tabular]}>{formatCurrency(r.biggest_expense.amount)}</Text>
                </View>
              ) : null}
              {r.fixed_costs_monthly > 0 ? (
                <TouchableOpacity style={[styles.statRow, styles.divider]} onPress={() => router.push('/recurring')} activeOpacity={0.7}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.statLabel}>Stałe płatności</Text>
                    {r.subscriptions_count > 0 ? (
                      <Text style={styles.statHint}>w tym subskrypcje: {formatCurrency(r.subscriptions_monthly)}</Text>
                    ) : null}
                  </View>
                  <Text style={[styles.statValue, tabular]}>{formatCurrency(r.fixed_costs_monthly)}</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.textLight} style={{ marginLeft: 4 }} />
                </TouchableOpacity>
              ) : null}
              {r.budget ? (
                <View style={[styles.statRow, styles.divider]}>
                  <Text style={styles.statLabel}>Budżet</Text>
                  <Text style={[styles.statValue, tabular, { color: r.budget.left < 0 ? colors.expense : colors.text }]}>
                    {r.budget.left < 0 ? `przekroczony o ${formatCurrency(-r.budget.left)}` : `zostało ${formatCurrency(r.budget.left)}`}
                  </Text>
                </View>
              ) : null}
            </Card>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    content: { paddingHorizontal: space.lg },
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
    hero: { backgroundColor: colors.primary, borderRadius: radius.lg, padding: space.xl, marginBottom: space.md },
    heroLabel: { color: colors.onPrimary, opacity: 0.85, fontSize: 14, fontWeight: '600' },
    heroAmount: { color: colors.onPrimary, fontSize: 36, fontWeight: '800', letterSpacing: -0.6, marginTop: 4 },
    heroSub: { color: colors.onPrimary, opacity: 0.9, fontSize: 14, marginTop: 2 },
    heroDivider: { height: 1, backgroundColor: colors.onPrimary, opacity: 0.18, marginVertical: space.lg },
    heroRow: { flexDirection: 'row' },
    heroCol: { flex: 1 },
    heroColLabel: { color: colors.onPrimary, opacity: 0.85, fontSize: 13 },
    heroColValue: { color: colors.onPrimary, fontSize: 18, fontWeight: '700', marginTop: 2 },
    heroChange: { color: colors.onPrimary, opacity: 0.85, fontSize: 12, marginTop: 2 },
    cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: space.xs },
    cardTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginLeft: 6 },
    cardTitleAlone: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: space.sm },
    tipCard: { backgroundColor: colors.primarySoft, borderColor: colors.primarySoft },
    tipText: { fontSize: 15, color: colors.text, lineHeight: 21, marginTop: space.xs },
    categoryRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.sm },
    categoryIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginRight: space.md },
    categoryTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
    categoryName: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text, marginRight: space.sm },
    changeBadge: { fontSize: 12, fontWeight: '700', marginRight: space.sm },
    categoryAmount: { fontSize: 14, fontWeight: '700', color: colors.text },
    statRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.md },
    divider: { borderTopWidth: 1, borderTopColor: colors.divider },
    statLabel: { flex: 1, fontSize: 14, color: colors.text },
    statHint: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
    statValue: { fontSize: 15, fontWeight: '700', color: colors.text },
  });
