import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';
import api from '../../utils/api';
import { MonthlyStats } from '../../utils/types';
import { PieChart } from 'react-native-gifted-charts';

const screenWidth = Dimensions.get('window').width;

export default function StatsScreen() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<MonthlyStats | null>(null);

  const styles = createStyles(colors, isDark);

  useFocusEffect(
    useCallback(() => {
      loadStats();
    }, [])
  );

  const loadStats = async () => {
    try {
      const response = await api.get('/transactions/stats/monthly');
      setStats(response.data);
    } catch (error: any) {
      console.error('Error loading stats:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadStats();
  };

  const formatCurrency = (amount: number) => {
    return `${amount.toFixed(2)} zł`;
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
    }));
  };

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
      contentContainerStyle={[styles.contentContainer, { paddingBottom: insets.bottom + 20 }]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
      }
    >
      {/* Summary Cards */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryCardIncome}>
          <Ionicons name="arrow-down-circle" size={36} color={isDark ? '#66BB6A' : colors.income} />
          <Text style={styles.summaryLabel}>Przychody</Text>
          <Text style={[styles.summaryAmount, { color: isDark ? '#66BB6A' : colors.income }]}>
            {formatCurrency(stats?.total_income || 0)}
          </Text>
        </View>
        <View style={styles.summaryCardExpense}>
          <Ionicons name="arrow-up-circle" size={36} color={isDark ? '#EF5350' : colors.expense} />
          <Text style={styles.summaryLabel}>Wydatki</Text>
          <Text style={[styles.summaryAmount, { color: isDark ? '#EF5350' : colors.expense }]}>
            {formatCurrency(stats?.total_expenses || 0)}
          </Text>
        </View>
      </View>

      {/* Balance Card */}
      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Bilans miesięczny</Text>
        <Text
          style={[
            styles.balanceAmount,
            { color: (stats?.balance || 0) >= 0 ? (isDark ? '#66BB6A' : colors.income) : (isDark ? '#EF5350' : colors.expense) },
          ]}
        >
          {(stats?.balance || 0) >= 0 ? '+' : ''}{formatCurrency(stats?.balance || 0)}
        </Text>
      </View>

      {/* Pie Chart */}
      {pieData.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Wydatki wg kategorii</Text>
          <View style={styles.chartContainer}>
            <PieChart
              data={pieData}
              radius={100}
              donut
              innerRadius={65}
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
            {pieData.map((item, index) => (
              <View key={index} style={styles.legendItem}>
                <View style={[styles.legendColor, { backgroundColor: item.color }]} />
                <Text style={styles.legendLabel} numberOfLines={1}>{item.label}</Text>
                <Text style={styles.legendValue}>{formatCurrency(item.value)}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Top Categories */}
      {stats && stats.top_categories.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Top kategorie</Text>
          {stats.top_categories.map((item, index) => (
            <View key={index} style={styles.topCategoryItem}>
              <View style={styles.topCategoryLeft}>
                <View style={[styles.topCategoryRank, { backgroundColor: index < 3 ? colors.primary : colors.textLight }]}>
                  <Text style={styles.topCategoryRankText}>{index + 1}</Text>
                </View>
                <Text style={styles.topCategoryName}>{item.category}</Text>
              </View>
              <Text style={styles.topCategoryAmount}>{formatCurrency(item.amount)}</Text>
            </View>
          ))}
        </View>
      )}

      {(!stats || Object.keys(stats.expenses_by_category).length === 0) && (
        <View style={styles.emptyState}>
          <Ionicons name="bar-chart-outline" size={64} color={colors.textLight} />
          <Text style={styles.emptyText}>Brak danych do wyświetlenia</Text>
          <Text style={styles.emptySubtext}>Dodaj transakcje aby zobaczyć statystyki</Text>
        </View>
      )}
    </ScrollView>
  );
}

const createStyles = (colors: any, isDark: boolean) => StyleSheet.create({
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
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 12,
  },
  summaryCardIncome: {
    flex: 1,
    padding: 18,
    borderRadius: 16,
    alignItems: 'center',
    backgroundColor: isDark ? '#1B3D1B' : '#E8F5E9',
    borderWidth: isDark ? 1 : 0,
    borderColor: '#66BB6A',
  },
  summaryCardExpense: {
    flex: 1,
    padding: 18,
    borderRadius: 16,
    alignItems: 'center',
    backgroundColor: isDark ? '#3D1B1B' : '#FFEBEE',
    borderWidth: isDark ? 1 : 0,
    borderColor: '#EF5350',
  },
  summaryLabel: {
    fontSize: 14,
    color: colors.text,
    marginTop: 10,
    fontWeight: '500',
  },
  summaryAmount: {
    fontSize: 22,
    fontWeight: 'bold',
    marginTop: 6,
  },
  balanceCard: {
    backgroundColor: isDark ? colors.surface : colors.primary,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: isDark ? 1 : 0,
    borderColor: colors.primary,
  },
  balanceLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: isDark ? colors.text : '#fff',
  },
  balanceAmount: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: isDark ? 0.3 : 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 18,
  },
  chartContainer: {
    alignItems: 'center',
    marginVertical: 16,
  },
  centerLabel: {
    alignItems: 'center',
  },
  centerLabelAmount: {
    fontSize: 15,
    fontWeight: 'bold',
    color: colors.text,
  },
  centerLabelText: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  legend: {
    marginTop: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    paddingVertical: 4,
  },
  legendColor: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginRight: 10,
  },
  legendLabel: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
  },
  legendValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  topCategoryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  topCategoryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  topCategoryRank: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  topCategoryRankText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fff',
  },
  topCategoryName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  topCategoryAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: isDark ? '#EF5350' : colors.expense,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    backgroundColor: colors.surface,
    borderRadius: 16,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.textLight,
    marginTop: 8,
  },
});
