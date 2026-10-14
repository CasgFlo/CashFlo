import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../utils/api';

interface AdminStats {
  users: {
    total: number;
    pro: number;
    free: number;
    pro_conversion_pct: number;
    new_today: number;
    new_week: number;
    new_month: number;
  };
  activity: {
    dau: number;
    wau: number;
    mau: number;
    weekly_retention_pct: number;
    monthly_retention_pct: number;
  };
  revenue: {
    total_pln: number;
    month_pln: number;
    paid_count: number;
  };
  data: {
    transactions: number;
    goals: number;
    budgets: number;
  };
}

interface TimelineDay {
  date: string;
  new_users: number;
  active_users: number;
}

export default function AdminDashboardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { user } = useAuth();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [timeline, setTimeline] = useState<TimelineDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [statsRes, timelineRes] = await Promise.all([
        api.get('/admin/stats'),
        api.get('/admin/activity/timeline?days=14'),
      ]);
      setStats(statsRes.data);
      setTimeline(timelineRes.data.timeline || []);
    } catch (e: any) {
      console.log('Admin stats error', e?.response?.data || e.message);
      Alert.alert('Błąd', 'Nie udało się pobrać statystyk administratora.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (user === undefined || user === null) {
      return;
    }
    if (!user.is_admin) {
      const timer = setTimeout(() => {
        Alert.alert('Brak dostępu', 'Nie masz uprawnień administratora.', [
          { text: 'OK', onPress: () => router.replace('/(tabs)/more') },
        ]);
      }, 100);
      return () => clearTimeout(timer);
    }
    load();
  }, [user, load, router]);

  const styles = createStyles(colors);

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const maxTimeline = Math.max(1, ...timeline.flatMap((t) => [t.new_users, t.active_users]));

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
        >
          <Ionicons name="arrow-back" size={28} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Panel Administratora</Text>
          <Text style={styles.headerSubtitle}>CashFlo • Statystyki</Text>
        </View>
        <View style={styles.adminBadge}>
          <Ionicons name="shield-checkmark" size={14} color="#fff" />
          <Text style={styles.adminBadgeText}>ADMIN</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={colors.primary}
          />
        }
      >
        {/* Quick Actions */}
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/admin/users')}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#9333EA20' }]}>
              <Ionicons name="people" size={26} color="#9333EA" />
            </View>
            <Text style={styles.actionTitle}>Użytkownicy</Text>
            <Text style={styles.actionSubtitle}>
              {stats?.users.total ?? 0} osób
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/admin/users?filter=pro')}
          >
            <View style={[styles.actionIcon, { backgroundColor: colors.warning + '20' }]}>
              <Ionicons name="star" size={26} color={colors.warning} />
            </View>
            <Text style={styles.actionTitle}>Pro</Text>
            <Text style={styles.actionSubtitle}>
              {stats?.users.pro ?? 0} aktywnych
            </Text>
          </TouchableOpacity>
        </View>

        {/* Key Metrics */}
        <Text style={styles.sectionTitle}>📊 Kluczowe wskaźniki</Text>
        <View style={styles.statsGrid}>
          <StatCard
            icon="people"
            label="Wszyscy"
            value={stats?.users.total ?? 0}
            color={colors.primary}
            colors={colors}
          />
          <StatCard
            icon="star"
            label="Konwersja Pro"
            value={`${stats?.users.pro_conversion_pct ?? 0}%`}
            color={colors.warning}
            colors={colors}
          />
          <StatCard
            icon="flash"
            label="DAU"
            value={stats?.activity.dau ?? 0}
            hint="dzisiaj"
            color={colors.success}
            colors={colors}
          />
          <StatCard
            icon="calendar"
            label="WAU"
            value={stats?.activity.wau ?? 0}
            hint="tydzień"
            color={colors.info}
            colors={colors}
          />
          <StatCard
            icon="calendar-outline"
            label="MAU"
            value={stats?.activity.mau ?? 0}
            hint="miesiąc"
            color="#6366F1"
            colors={colors}
          />
          <StatCard
            icon="repeat"
            label="Regularnych"
            value={`${stats?.activity.weekly_retention_pct ?? 0}%`}
            hint="aktywni 7d"
            color="#EC4899"
            colors={colors}
          />
        </View>

        {/* Revenue */}
        <Text style={styles.sectionTitle}>💰 Przychody</Text>
        <View style={styles.revenueCard}>
          <View style={styles.revenueRow}>
            <View>
              <Text style={styles.revenueLabel}>Łącznie</Text>
              <Text style={styles.revenueValue}>
                {(stats?.revenue.total_pln ?? 0).toFixed(2)} zł
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.revenueLabel}>Ten miesiąc</Text>
              <Text style={[styles.revenueValue, { color: colors.success }]}>
                {(stats?.revenue.month_pln ?? 0).toFixed(2)} zł
              </Text>
            </View>
          </View>
          <View style={styles.revenueDivider} />
          <View style={styles.revenueRow}>
            <Text style={styles.revenueSmall}>Liczba opłaconych transakcji</Text>
            <Text style={styles.revenueSmallValue}>{stats?.revenue.paid_count ?? 0}</Text>
          </View>
        </View>

        {/* New users breakdown */}
        <Text style={styles.sectionTitle}>👥 Nowi użytkownicy</Text>
        <View style={styles.newUsersCard}>
          <NewUsersRow label="Dzisiaj" value={stats?.users.new_today ?? 0} colors={colors} />
          <NewUsersRow label="Ostatnie 7 dni" value={stats?.users.new_week ?? 0} colors={colors} />
          <NewUsersRow label="Ostatnie 30 dni" value={stats?.users.new_month ?? 0} colors={colors} last colors2={colors} />
        </View>

        {/* Timeline Chart */}
        <Text style={styles.sectionTitle}>📈 Aktywność (14 dni)</Text>
        <View style={styles.chartCard}>
          <View style={styles.chartLegend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
              <Text style={styles.legendText}>Aktywni</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: colors.warning }]} />
              <Text style={styles.legendText}>Nowi</Text>
            </View>
          </View>
          <View style={styles.chartArea}>
            {timeline.map((day, idx) => {
              const activeH = (day.active_users / maxTimeline) * 100;
              const newH = (day.new_users / maxTimeline) * 100;
              const dayLabel = day.date.split('-').slice(-1)[0];
              return (
                <View key={idx} style={styles.chartBar}>
                  <View style={styles.chartBarStack}>
                    <View
                      style={{
                        width: 10,
                        height: `${Math.max(activeH, 2)}%`,
                        backgroundColor: colors.primary,
                        borderTopLeftRadius: 3,
                        borderTopRightRadius: 3,
                      }}
                    />
                    <View
                      style={{
                        width: 10,
                        height: `${Math.max(newH, 2)}%`,
                        backgroundColor: colors.warning,
                        borderTopLeftRadius: 3,
                        borderTopRightRadius: 3,
                        marginLeft: 2,
                      }}
                    />
                  </View>
                  <Text style={styles.chartLabel}>{dayLabel}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Data */}
        <Text style={styles.sectionTitle}>💾 Dane w bazie</Text>
        <View style={styles.dataCard}>
          <DataRow icon="swap-horizontal" label="Transakcje" value={stats?.data.transactions ?? 0} colors={colors} />
          <DataRow icon="trophy" label="Cele" value={stats?.data.goals ?? 0} colors={colors} />
          <DataRow icon="wallet" label="Budżety" value={stats?.data.budgets ?? 0} colors={colors} last />
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// ============ SUB-COMPONENTS ============

const StatCard = ({ icon, label, value, hint, color, colors }: any) => {
  const s = createStyles(colors);
  return (
    <View style={s.statCard}>
      <View style={[s.statIcon, { backgroundColor: color + '20' }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
      {hint && <Text style={s.statHint}>{hint}</Text>}
    </View>
  );
};

const NewUsersRow = ({ label, value, colors, last }: any) => {
  const s = createStyles(colors);
  return (
    <View style={[s.newUsersRow, last && { borderBottomWidth: 0 }]}>
      <Text style={s.newUsersLabel}>{label}</Text>
      <View style={s.newUsersBadge}>
        <Text style={s.newUsersValue}>+{value}</Text>
      </View>
    </View>
  );
};

const DataRow = ({ icon, label, value, colors, last }: any) => {
  const s = createStyles(colors);
  return (
    <View style={[s.dataRow, last && { borderBottomWidth: 0 }]}>
      <Ionicons name={icon} size={20} color={colors.textSecondary} style={{ marginRight: 12 }} />
      <Text style={s.dataLabel}>{label}</Text>
      <Text style={s.dataValue}>{value}</Text>
    </View>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: colors.surface,
    },
    backButton: { padding: 4, marginRight: 8 },
    headerTitle: { fontSize: 20, fontWeight: '700', color: colors.text },
    headerSubtitle: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
    adminBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#9333EA',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 12,
    },
    adminBadgeText: { fontSize: 10, fontWeight: '700', color: '#fff', marginLeft: 4 },
    content: { padding: 16 },
    actionsRow: { flexDirection: 'row', gap: 12, marginBottom: 8 },
    actionCard: {
      flex: 1,
      backgroundColor: colors.surface,
      padding: 16,
      borderRadius: 16,
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 4,
      elevation: 2,
    },
    actionIcon: {
      width: 50,
      height: 50,
      borderRadius: 25,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 8,
    },
    actionTitle: { fontSize: 14, fontWeight: '600', color: colors.text },
    actionSubtitle: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
    sectionTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.text,
      marginTop: 20,
      marginBottom: 10,
      marginLeft: 4,
    },
    statsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    statCard: {
      width: '31%',
      backgroundColor: colors.surface,
      padding: 12,
      borderRadius: 12,
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 2,
      elevation: 1,
    },
    statIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 6,
    },
    statValue: { fontSize: 18, fontWeight: '700', color: colors.text },
    statLabel: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
    statHint: { fontSize: 9, color: colors.textLight, marginTop: 1 },
    revenueCard: {
      backgroundColor: colors.surface,
      padding: 16,
      borderRadius: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 2,
    },
    revenueRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    revenueLabel: { fontSize: 12, color: colors.textSecondary },
    revenueValue: { fontSize: 22, fontWeight: '700', color: colors.text, marginTop: 2 },
    revenueDivider: { height: 1, backgroundColor: colors.divider, marginVertical: 12 },
    revenueSmall: { fontSize: 13, color: colors.textSecondary },
    revenueSmallValue: { fontSize: 14, fontWeight: '600', color: colors.text },
    newUsersCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 2,
    },
    newUsersRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
    },
    newUsersLabel: { fontSize: 14, color: colors.text },
    newUsersBadge: {
      backgroundColor: colors.success + '20',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 10,
    },
    newUsersValue: { fontSize: 13, fontWeight: '700', color: colors.success },
    chartCard: {
      backgroundColor: colors.surface,
      padding: 14,
      borderRadius: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 2,
    },
    chartLegend: { flexDirection: 'row', gap: 16, marginBottom: 12 },
    legendItem: { flexDirection: 'row', alignItems: 'center' },
    legendDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
    legendText: { fontSize: 12, color: colors.textSecondary },
    chartArea: {
      flexDirection: 'row',
      height: 120,
      alignItems: 'flex-end',
      justifyContent: 'space-between',
    },
    chartBar: { alignItems: 'center', flex: 1 },
    chartBarStack: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      height: 100,
    },
    chartLabel: { fontSize: 10, color: colors.textLight, marginTop: 4 },
    dataCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 2,
    },
    dataRow: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
    },
    dataLabel: { flex: 1, fontSize: 14, color: colors.text },
    dataValue: { fontSize: 14, fontWeight: '700', color: colors.primary },
  });
