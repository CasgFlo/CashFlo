import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, SectionList, RefreshControl, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format } from 'date-fns';
import { useTheme, ThemeColors } from '../../contexts/ThemeContext';
import api from '../../utils/api';
import { Transaction, Category } from '../../utils/types';
import { formatCurrency, formatDayLabel, parseServerDate } from '../../utils/format';
import { makeCategoryLookup } from '../../utils/categories';
import { LargeTitle, SegmentedControl, TransactionRow, Fab, EmptyState, tabular, space, radius } from '../../components/ui';

const PAGE_SIZE = 50;
type Filter = 'all' | 'expense' | 'income';

interface DaySection {
  key: string;
  title: string;
  net: number;
  data: Transaction[];
}

export default function TransactionsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const styles = createStyles(colors);
  const lookup = useMemo(() => makeCategoryLookup(categories), [categories]);

  const fetchPage = async (activeFilter: Filter, skip: number) => {
    const typeParam = activeFilter === 'all' ? '' : `&type=${activeFilter}`;
    const response = await api.get(`/transactions?limit=${PAGE_SIZE}&skip=${skip}${typeParam}`);
    return response.data as Transaction[];
  };

  const loadFirstPage = async (activeFilter: Filter) => {
    try {
      const [page, categoriesRes] = await Promise.all([fetchPage(activeFilter, 0), api.get('/categories')]);
      setTransactions(page);
      setCategories(categoriesRes.data);
      setHasMore(page.length === PAGE_SIZE);
      setLoadError(false);
    } catch (error) {
      console.error('Error loading transactions:', error);
      setLoadError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Refresh when the screen comes into focus or the filter changes
  useFocusEffect(
    useCallback(() => {
      loadFirstPage(filter);
    }, [filter])
  );

  const loadMore = async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchPage(filter, transactions.length);
      setTransactions((current) => [...current, ...page]);
      setHasMore(page.length === PAGE_SIZE);
    } catch (error) {
      console.error('Error loading more transactions:', error);
    } finally {
      setLoadingMore(false);
    }
  };

  const changeFilter = (value: Filter) => {
    if (value === filter) return;
    setLoading(true);
    setFilter(value);
  };

  // Group by day, newest first
  const sections: DaySection[] = useMemo(() => {
    const map = new Map<string, DaySection>();
    for (const t of transactions) {
      const date = parseServerDate(t.date);
      const key = format(date, 'yyyy-MM-dd');
      let section = map.get(key);
      if (!section) {
        section = { key, title: formatDayLabel(date), net: 0, data: [] };
        map.set(key, section);
      }
      section.data.push(t);
      section.net += t.type === 'income' ? t.amount : -t.amount;
    }
    return Array.from(map.values());
  }, [transactions]);

  const header = (
    <View>
      <LargeTitle title="Transakcje" />
      <SegmentedControl<Filter>
        value={filter}
        onChange={changeFilter}
        options={[
          { value: 'all', label: 'Wszystkie' },
          { value: 'expense', label: 'Wydatki' },
          { value: 'income', label: 'Przychody' },
        ]}
      />
      {loadError ? (
        <Text style={styles.errorText}>Nie udało się pobrać transakcji. Przeciągnij w dół, aby spróbować ponownie.</Text>
      ) : null}
      <View style={{ height: space.md }} />
    </View>
  );

  return (
    <View style={styles.screen}>
      <SectionList
        sections={loading ? [] : sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space.sm }]}
        ListHeaderComponent={header}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadFirstPage(filter);
            }}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.dayHeader}>
            <Text style={styles.dayTitle}>{section.title}</Text>
            <Text style={[styles.dayNet, tabular, { color: section.net >= 0 ? colors.income : colors.textSecondary }]}>
              {section.net >= 0 ? '+' : '−'}
              {formatCurrency(Math.abs(section.net))}
            </Text>
          </View>
        )}
        renderItem={({ item, index, section }) => {
          const first = index === 0;
          const last = index === section.data.length - 1;
          return (
            <View
              style={[
                styles.rowBox,
                first && styles.rowFirst,
                last && styles.rowLast,
                !first && styles.rowDivider,
              ]}
            >
              <TransactionRow
                transaction={item}
                category={lookup(item.category, item.type)}
                onPress={() => router.push({ pathname: '/transaction/add', params: { id: item.id } })}
              />
            </View>
          );
        }}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator style={{ marginTop: space.xxl }} color={colors.primary} />
          ) : (
            <EmptyState
              icon="receipt-outline"
              title={filter === 'income' ? 'Brak przychodów' : filter === 'expense' ? 'Brak wydatków' : 'Brak transakcji'}
              text="Dodane transakcje pojawią się tutaj, pogrupowane według dni."
              actionLabel="Dodaj transakcję"
              onAction={() => router.push('/transaction/add')}
            />
          )
        }
        ListFooterComponent={
          hasMore && !loading ? (
            <TouchableOpacity style={styles.moreButton} onPress={loadMore} disabled={loadingMore}>
              {loadingMore ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Text style={styles.moreText}>Pokaż starsze transakcje</Text>
              )}
            </TouchableOpacity>
          ) : null
        }
      />

      <Fab onPress={() => router.push('/transaction/add')} label="Dodaj transakcję" />
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    content: { paddingHorizontal: space.lg, paddingBottom: 120 },
    errorText: { color: colors.error, fontSize: 14, marginTop: space.md },
    dayHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: space.lg,
      marginBottom: space.sm,
      paddingHorizontal: space.xs,
    },
    dayTitle: { fontSize: 14, fontWeight: '700', color: colors.textSecondary, textTransform: 'capitalize' },
    dayNet: { fontSize: 13, fontWeight: '600' },
    rowBox: {
      backgroundColor: colors.surface,
      paddingHorizontal: space.md,
      borderLeftWidth: 1,
      borderRightWidth: 1,
      borderColor: colors.border,
    },
    rowFirst: { borderTopWidth: 1, borderTopLeftRadius: radius.md, borderTopRightRadius: radius.md },
    rowLast: { borderBottomWidth: 1, borderBottomLeftRadius: radius.md, borderBottomRightRadius: radius.md },
    rowDivider: { borderTopWidth: 1, borderTopColor: colors.divider },
    moreButton: {
      marginTop: space.lg,
      minHeight: 48,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    moreText: { fontSize: 15, fontWeight: '600', color: colors.primary },
  });
