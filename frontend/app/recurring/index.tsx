import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, ThemeColors } from '../../contexts/ThemeContext';
import api from '../../utils/api';
import { Category, RecurringList, RecurringPayment, RecurringSuggestion } from '../../utils/types';
import { apiErrorMessage, formatCurrency, formatDueDate, formatFrequency, isProLimitError, parseDay, parseServerDate } from '../../utils/format';
import { makeCategoryLookup } from '../../utils/categories';
import { promptPro } from '../../utils/pro';
import { showMessage } from '../../utils/confirm';
import { ScreenHeader, Card, Button, EmptyState, IconBubble, SectionHeader, tabular, space, radius } from '../../components/ui';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export default function RecurringScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = createStyles(colors);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [data, setData] = useState<RecurringList | null>(null);
  const [suggestions, setSuggestions] = useState<RecurringSuggestion[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const lookup = useMemo(() => makeCategoryLookup(categories), [categories]);
  const openPro = () => router.push('/pro/upgrade');

  const load = async () => {
    try {
      const [listRes, suggestionsRes, categoriesRes] = await Promise.all([
        api.get('/recurring'),
        api.get('/recurring/suggestions'),
        api.get('/categories'),
      ]);
      setData(listRes.data);
      setSuggestions(suggestionsRes.data.suggestions || []);
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
      load();
    }, [])
  );

  const limitMessage = 'W wersji darmowej możesz mieć 3 stałe płatności. W CashFlo Pro dodasz ich bez limitu.';

  const addNew = () => {
    if (data && !data.can_add) {
      promptPro(limitMessage, openPro);
      return;
    }
    router.push('/recurring/edit');
  };

  const acceptSuggestion = async (s: RecurringSuggestion) => {
    if (data && !data.can_add) {
      promptPro(limitMessage, openPro);
      return;
    }
    setBusyKey(s.key);
    try {
      await api.post('/recurring', {
        name: s.name,
        amount: s.amount,
        type: 'expense',
        category: s.category,
        frequency: s.frequency,
        next_date: parseDay(s.next_date).toISOString(),
        is_subscription: s.is_subscription,
        suggestion_key: s.key,
        link_transaction_ids: s.transaction_ids,
      });
      await load();
    } catch (e) {
      if (isProLimitError(e)) promptPro(limitMessage, openPro);
      else showMessage('Błąd', apiErrorMessage(e, 'Nie udało się dodać płatności.'));
    } finally {
      setBusyKey(null);
    }
  };

  const dismissSuggestion = async (s: RecurringSuggestion) => {
    setSuggestions((current) => current.filter((x) => x.key !== s.key));
    try {
      await api.post('/recurring/suggestions/dismiss', { key: s.key });
    } catch {
      // Not important if it fails: it may just be suggested again
    }
  };

  if (loading) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const items = data?.items || [];
  const active = items.filter((r) => r.active);
  const groups: { title: string; items: RecurringPayment[] }[] = [
    { title: 'Subskrypcje', items: active.filter((r) => r.type === 'expense' && r.is_subscription) },
    { title: 'Rachunki i inne opłaty', items: active.filter((r) => r.type === 'expense' && !r.is_subscription) },
    { title: 'Stałe przychody', items: active.filter((r) => r.type === 'income') },
    { title: 'Wstrzymane', items: items.filter((r) => !r.active) },
  ].filter((g) => g.items.length > 0);
  const summary = data?.summary;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xxl }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <ScreenHeader
          title="Stałe płatności"
          onBack={() => router.back()}
          right={
            items.length > 0 ? (
              <TouchableOpacity onPress={addNew} style={styles.addButton} accessibilityLabel="Dodaj stałą płatność">
                <Ionicons name="add" size={24} color={colors.onPrimary} />
              </TouchableOpacity>
            ) : undefined
          }
        />

        {loadError ? (
          <Text style={styles.errorText}>Nie udało się pobrać danych. Przeciągnij w dół, aby spróbować ponownie.</Text>
        ) : null}

        {summary && summary.active_count > 0 ? (
          <View style={styles.hero}>
            <Text style={styles.heroLabel}>Stałe płatności i subskrypcje</Text>
            <Text style={[styles.heroAmount, tabular]} adjustsFontSizeToFit numberOfLines={1}>
              {formatCurrency(summary.monthly_expenses)}
            </Text>
            <Text style={[styles.heroSub, tabular]}>miesięcznie, czyli {formatCurrency(summary.yearly_expenses, { hideZeroDecimals: true })} rocznie</Text>
            {summary.subscriptions_count > 0 ? (
              <View style={styles.heroPill}>
                <Ionicons name="play-circle-outline" size={16} color={colors.onPrimary} />
                <Text style={[styles.heroPillText, tabular]}>
                  w tym subskrypcje: {formatCurrency(summary.subscriptions_monthly)} / mies. ·{' '}
                  {formatCurrency(summary.subscriptions_monthly * 12, { hideZeroDecimals: true })} rocznie
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Detected in past transactions */}
        {suggestions.length > 0 ? (
          <>
            <SectionHeader title="Wykryte w Twoich wydatkach" />
            {suggestions.map((s) => {
              const category = lookup(s.category, 'expense');
              return (
                <Card key={s.key} style={styles.suggestion}>
                  <View style={styles.suggestionTop}>
                    <IconBubble name={(category?.icon as IconName) || 'repeat'} color={category?.color || colors.primary} size={40} />
                    <View style={{ flex: 1, marginLeft: space.md }}>
                      <Text style={styles.rowTitle} numberOfLines={1}>{s.name}</Text>
                      <Text style={styles.rowSubtitle}>
                        {formatFrequency(s.frequency)} · {s.occurrences} płatności w historii
                      </Text>
                    </View>
                    <Text style={[styles.rowAmount, tabular]}>{formatCurrency(s.amount)}</Text>
                  </View>
                  <View style={styles.suggestionButtons}>
                    <TouchableOpacity style={styles.dismiss} onPress={() => dismissSuggestion(s)}>
                      <Text style={styles.dismissText}>Pomiń</Text>
                    </TouchableOpacity>
                    <Button
                      title={s.is_subscription ? 'Dodaj subskrypcję' : 'Dodaj'}
                      icon="add"
                      onPress={() => acceptSuggestion(s)}
                      loading={busyKey === s.key}
                      style={styles.acceptButton}
                    />
                  </View>
                </Card>
              );
            })}
          </>
        ) : null}

        {items.length === 0 ? (
          <EmptyState
            icon="repeat"
            title="Dodaj stałe płatności"
            text="Czynsz, telefon, Netflix czy pensja. Dodamy je same w dniu płatności i pokażemy, ile kosztują Cię w roku."
            actionLabel="Dodaj płatność"
            onAction={addNew}
          />
        ) : null}

        {groups.map((group) => (
          <View key={group.title}>
            <SectionHeader title={group.title} />
            <Card style={styles.listCard}>
              {group.items.map((r, index) => {
                const category = lookup(r.category, r.type);
                const isIncome = r.type === 'income';
                return (
                  <TouchableOpacity
                    key={r.id}
                    style={[styles.row, index > 0 && styles.divider, !r.active && { opacity: 0.55 }]}
                    onPress={() => router.push({ pathname: '/recurring/edit', params: { id: r.id } })}
                    activeOpacity={0.7}
                  >
                    <IconBubble
                      name={(category?.icon as IconName) || (isIncome ? 'arrow-down' : 'repeat')}
                      color={category?.color || (isIncome ? colors.income : colors.primary)}
                      size={40}
                    />
                    <View style={{ flex: 1, marginHorizontal: space.md }}>
                      <Text style={styles.rowTitle} numberOfLines={1}>{r.name}</Text>
                      <Text style={styles.rowSubtitle} numberOfLines={1}>
                        {r.active
                          ? `${formatFrequency(r.frequency)} · następna ${formatDueDate(parseServerDate(r.next_date))}`
                          : 'wstrzymana'}
                      </Text>
                    </View>
                    <Text style={[styles.rowAmount, tabular, isIncome && { color: colors.income }]}>
                      {isIncome ? '+' : ''}
                      {formatCurrency(r.amount)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </Card>
          </View>
        ))}

        {data && data.limit !== null && items.length > 0 ? (
          <TouchableOpacity style={styles.limitRow} onPress={openPro} activeOpacity={0.7}>
            <Ionicons name="star-outline" size={16} color={colors.warning} />
            <Text style={styles.limitText}>
              {summary?.active_count ?? 0} z {data.limit} stałych płatności w wersji darmowej. W Pro bez limitu.
            </Text>
          </TouchableOpacity>
        ) : null}

        {items.length > 0 ? (
          <Text style={styles.footnote}>
            Płatności dodają się do wydatków same w dniu płatności. Usunięcie stałej płatności nie usuwa transakcji, które już dodała.
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    center: { alignItems: 'center', justifyContent: 'center' },
    content: { paddingHorizontal: space.lg },
    addButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    errorText: { color: colors.error, fontSize: 14, marginBottom: space.md },
    hero: { backgroundColor: colors.primary, borderRadius: radius.lg, padding: space.xl, marginBottom: space.md },
    heroLabel: { color: colors.onPrimary, opacity: 0.85, fontSize: 14, fontWeight: '600' },
    heroAmount: { color: colors.onPrimary, fontSize: 34, fontWeight: '800', letterSpacing: -0.6, marginTop: 4 },
    heroSub: { color: colors.onPrimary, opacity: 0.85, fontSize: 14, marginTop: 2 },
    heroPill: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      backgroundColor: 'rgba(255,255,255,0.16)',
      borderRadius: radius.pill,
      paddingHorizontal: 10,
      paddingVertical: 5,
      marginTop: space.md,
    },
    heroPillText: { color: colors.onPrimary, fontSize: 13, fontWeight: '600', marginLeft: 6, flexShrink: 1 },
    suggestion: { borderColor: colors.primary + '55' },
    suggestionTop: { flexDirection: 'row', alignItems: 'center' },
    suggestionButtons: { flexDirection: 'row', alignItems: 'center', marginTop: space.md },
    dismiss: { paddingHorizontal: space.lg, minHeight: 44, justifyContent: 'center' },
    dismissText: { fontSize: 15, fontWeight: '600', color: colors.textSecondary },
    acceptButton: { flex: 1, minHeight: 44 },
    listCard: { paddingVertical: space.xs },
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.md },
    divider: { borderTopWidth: 1, borderTopColor: colors.divider },
    rowTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
    rowSubtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
    rowAmount: { fontSize: 15, fontWeight: '700', color: colors.text },
    limitRow: { flexDirection: 'row', alignItems: 'center', marginTop: space.sm, paddingVertical: space.sm },
    limitText: { flex: 1, fontSize: 13, color: colors.textSecondary, marginLeft: 6 },
    footnote: { fontSize: 12, color: colors.textLight, lineHeight: 17, marginTop: space.md },
  });
