import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Alert,
  RefreshControl,
  Modal,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../utils/api';

interface AdminUser {
  id: string;
  email: string;
  name: string;
  is_pro: boolean;
  is_admin: boolean;
  created_at: string;
  last_login: string | null;
  login_count: number;
  transactions_count: number;
  goals_count: number;
}

type FilterType = 'all' | 'pro' | 'free' | 'admin';

export default function AdminUsersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { user: currentUser } = useAuth();
  const params = useLocalSearchParams<{ filter?: string }>();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterType>((params.filter as FilterType) || 'all');
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/admin/users', { params: { search, limit: 500 } });
      setUsers(res.data.users || []);
    } catch (e: any) {
      Alert.alert('Błąd', 'Nie udało się pobrać użytkowników');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [search]);

  useEffect(() => {
    if (currentUser === undefined || currentUser === null) {
      // Auth still loading, wait
      return;
    }
    if (!currentUser.is_admin) {
      const timer = setTimeout(() => router.replace('/(tabs)/more'), 100);
      return () => clearTimeout(timer);
    }
    load();
  }, [currentUser, load, router]);

  const filteredUsers = users.filter((u) => {
    if (filter === 'pro') return u.is_pro;
    if (filter === 'free') return !u.is_pro;
    if (filter === 'admin') return u.is_admin;
    return true;
  });

  const openUserDetail = async (u: AdminUser) => {
    setSelectedUser(u);
    setDetailLoading(true);
    setDetail(null);
    try {
      const res = await api.get(`/admin/users/${u.id}/detail`);
      setDetail(res.data);
    } catch (e) {
      Alert.alert('Błąd', 'Nie udało się pobrać szczegółów');
    } finally {
      setDetailLoading(false);
    }
  };

  const togglePro = async (u: AdminUser) => {
    const newPro = !u.is_pro;
    const action = newPro ? 'nadać' : 'odebrać';
    Alert.alert(
      `Czy na pewno ${action} Pro?`,
      `${u.email}\n${newPro ? 'Otrzyma dostęp do wszystkich funkcji Pro.' : 'Straci dostęp do funkcji Pro.'}`,
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Potwierdź',
          onPress: async () => {
            try {
              await api.post(`/admin/users/${u.id}/pro`, { is_pro: newPro });
              setUsers((prev) =>
                prev.map((x) => (x.id === u.id ? { ...x, is_pro: newPro } : x))
              );
              if (selectedUser?.id === u.id) {
                setSelectedUser({ ...selectedUser, is_pro: newPro });
                setDetail((d: any) => (d ? { ...d, is_pro: newPro } : d));
              }
            } catch (e: any) {
              Alert.alert('Błąd', e?.response?.data?.detail || 'Nie udało się zmienić statusu');
            }
          },
        },
      ]
    );
  };

  const deleteUser = async (u: AdminUser) => {
    Alert.alert(
      'Usunąć użytkownika?',
      `${u.email}\n\nWszystkie dane (transakcje, cele, budżety) zostaną trwale usunięte. Tej operacji nie można cofnąć.`,
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Usuń',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/admin/users/${u.id}`);
              setUsers((prev) => prev.filter((x) => x.id !== u.id));
              setSelectedUser(null);
            } catch (e: any) {
              Alert.alert('Błąd', e?.response?.data?.detail || 'Nie udało się usunąć');
            }
          },
        },
      ]
    );
  };

  const styles = createStyles(colors);

  const formatDate = (dt: string | null | undefined) => {
    if (!dt) return 'nigdy';
    const d = new Date(dt);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'dzisiaj';
    if (diffDays === 1) return 'wczoraj';
    if (diffDays < 7) return `${diffDays} dni temu`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} tyg. temu`;
    return d.toLocaleDateString('pl-PL');
  };

  const filterTabs: { key: FilterType; label: string; count: number }[] = [
    { key: 'all', label: 'Wszyscy', count: users.length },
    { key: 'pro', label: 'Pro', count: users.filter((u) => u.is_pro).length },
    { key: 'free', label: 'Free', count: users.filter((u) => !u.is_pro).length },
    { key: 'admin', label: 'Admin', count: users.filter((u) => u.is_admin).length },
  ];

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
        <Text style={styles.headerTitle}>Użytkownicy</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={colors.textLight} />
        <TextInput
          style={styles.searchInput}
          placeholder="Szukaj po email lub imieniu..."
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={load}
          placeholderTextColor={colors.textLight}
          autoCapitalize="none"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => { setSearch(''); setTimeout(load, 100); }}>
            <Ionicons name="close-circle" size={20} color={colors.textLight} />
          </TouchableOpacity>
        )}
      </View>

      {/* Filter Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterTabs}
      >
        {filterTabs.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.filterTab, filter === tab.key && styles.filterTabActive]}
            onPress={() => setFilter(tab.key)}
          >
            <Text style={[styles.filterTabText, filter === tab.key && styles.filterTabTextActive]}>
              {tab.label} · {tab.count}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(); }}
              tintColor={colors.primary}
            />
          }
        >
          {filteredUsers.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={64} color={colors.textLight} />
              <Text style={styles.emptyText}>Brak użytkowników</Text>
            </View>
          ) : (
            filteredUsers.map((u) => (
              <TouchableOpacity
                key={u.id}
                style={styles.userCard}
                onPress={() => openUserDetail(u)}
                activeOpacity={0.7}
              >
                <View style={[styles.avatar, u.is_admin && { backgroundColor: '#9333EA' }]}>
                  <Text style={styles.avatarText}>
                    {(u.name || u.email)[0].toUpperCase()}
                  </Text>
                </View>
                <View style={styles.userInfo}>
                  <View style={styles.userNameRow}>
                    <Text style={styles.userName} numberOfLines={1}>
                      {u.name || u.email}
                    </Text>
                    {u.is_admin && (
                      <View style={[styles.miniBadge, { backgroundColor: '#9333EA' }]}>
                        <Text style={styles.miniBadgeText}>ADMIN</Text>
                      </View>
                    )}
                    {u.is_pro && !u.is_admin && (
                      <View style={[styles.miniBadge, { backgroundColor: colors.warning }]}>
                        <Text style={styles.miniBadgeText}>PRO</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.userEmail} numberOfLines={1}>{u.email}</Text>
                  <View style={styles.userMeta}>
                    <View style={styles.metaItem}>
                      <Ionicons name="time-outline" size={11} color={colors.textLight} />
                      <Text style={styles.metaText}>Ostatnio: {formatDate(u.last_login)}</Text>
                    </View>
                    <View style={styles.metaItem}>
                      <Ionicons name="log-in-outline" size={11} color={colors.textLight} />
                      <Text style={styles.metaText}>{u.login_count}× zalogowań</Text>
                    </View>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
              </TouchableOpacity>
            ))
          )}
          <View style={{ height: 30 }} />
        </ScrollView>
      )}

      {/* User Detail Modal */}
      <Modal
        visible={!!selectedUser}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedUser(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.modalHandle} />
            {detailLoading ? (
              <ActivityIndicator size="large" color={colors.primary} style={{ marginVertical: 40 }} />
            ) : detail ? (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.modalHeader}>
                  <View style={[styles.avatarLarge, detail.is_admin && { backgroundColor: '#9333EA' }]}>
                    <Text style={styles.avatarLargeText}>
                      {(detail.name || detail.email)[0].toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.modalUserName}>{detail.name}</Text>
                  <Text style={styles.modalUserEmail}>{detail.email}</Text>
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
                    {detail.is_admin && (
                      <View style={[styles.badge, { backgroundColor: '#9333EA' }]}>
                        <Text style={styles.badgeText}>ADMIN</Text>
                      </View>
                    )}
                    {detail.is_pro && (
                      <View style={[styles.badge, { backgroundColor: colors.warning }]}>
                        <Text style={styles.badgeText}>PRO</Text>
                      </View>
                    )}
                    {!detail.is_pro && !detail.is_admin && (
                      <View style={[styles.badge, { backgroundColor: colors.textLight }]}>
                        <Text style={styles.badgeText}>FREE</Text>
                      </View>
                    )}
                  </View>
                </View>

                <View style={styles.detailGrid}>
                  <DetailStat label="Logowań" value={detail.login_count || 0} colors={colors} />
                  <DetailStat label="Logowań 30d" value={detail.logins_last_30d || 0} colors={colors} />
                  <DetailStat label="Transakcje" value={detail.transactions_count || 0} colors={colors} />
                  <DetailStat label="Cele" value={detail.goals_count || 0} colors={colors} />
                </View>

                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionTitle}>Finanse użytkownika</Text>
                  <DetailRow label="Przychody" value={`${(detail.total_income || 0).toFixed(2)} zł`} color={colors.success} colors={colors} />
                  <DetailRow label="Wydatki" value={`${(detail.total_expenses || 0).toFixed(2)} zł`} color={colors.error} colors={colors} />
                  <DetailRow label="Saldo" value={`${(detail.balance || 0).toFixed(2)} zł`} color={colors.text} colors={colors} bold />
                </View>

                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionTitle}>Konto</Text>
                  <DetailRow label="Utworzono" value={formatDate(detail.created_at)} colors={colors} />
                  <DetailRow label="Ostatnio aktywny" value={formatDate(detail.last_login)} colors={colors} />
                </View>

                {detail.payments && detail.payments.length > 0 && (
                  <View style={styles.detailSection}>
                    <Text style={styles.detailSectionTitle}>Płatności ({detail.payments.length})</Text>
                    {detail.payments.slice(0, 5).map((p: any, i: number) => (
                      <View key={i} style={styles.paymentRow}>
                        <View>
                          <Text style={styles.paymentAmount}>
                            {p.amount?.toFixed(2)} {(p.currency || 'pln').toUpperCase()}
                          </Text>
                          <Text style={styles.paymentDate}>{formatDate(p.created_at)}</Text>
                        </View>
                        <View
                          style={[
                            styles.paymentStatus,
                            {
                              backgroundColor:
                                p.payment_status === 'paid'
                                  ? colors.success + '20'
                                  : colors.warning + '20',
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.paymentStatusText,
                              {
                                color:
                                  p.payment_status === 'paid' ? colors.success : colors.warning,
                              },
                            ]}
                          >
                            {p.payment_status === 'paid' ? 'Opłacone' : p.payment_status || 'oczekuje'}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}

                {/* Actions */}
                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={[
                      styles.actionBtn,
                      {
                        backgroundColor: detail.is_pro ? colors.textLight + '30' : colors.warning,
                      },
                    ]}
                    onPress={() => togglePro(selectedUser!)}
                    disabled={detail.is_admin}
                  >
                    <Ionicons
                      name={detail.is_pro ? 'remove-circle' : 'star'}
                      size={18}
                      color={detail.is_pro ? colors.text : '#fff'}
                    />
                    <Text
                      style={[
                        styles.actionBtnText,
                        { color: detail.is_pro ? colors.text : '#fff' },
                      ]}
                    >
                      {detail.is_pro ? 'Odbierz Pro' : 'Nadaj Pro'}
                    </Text>
                  </TouchableOpacity>
                  {!detail.is_admin && (
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: colors.error }]}
                      onPress={() => deleteUser(selectedUser!)}
                    >
                      <Ionicons name="trash" size={18} color="#fff" />
                      <Text style={[styles.actionBtnText, { color: '#fff' }]}>Usuń</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <TouchableOpacity
                  style={styles.closeBtn}
                  onPress={() => setSelectedUser(null)}
                >
                  <Text style={styles.closeBtnText}>Zamknij</Text>
                </TouchableOpacity>
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const DetailStat = ({ label, value, colors }: any) => {
  const s = createStyles(colors);
  return (
    <View style={s.detailStat}>
      <Text style={s.detailStatValue}>{value}</Text>
      <Text style={s.detailStatLabel}>{label}</Text>
    </View>
  );
};

const DetailRow = ({ label, value, color, colors, bold }: any) => {
  const s = createStyles(colors);
  return (
    <View style={s.detailRow}>
      <Text style={s.detailRowLabel}>{label}</Text>
      <Text style={[s.detailRowValue, { color: color || colors.text }, bold && { fontWeight: '700' }]}>
        {value}
      </Text>
    </View>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: colors.surface,
    },
    backButton: { padding: 4 },
    headerTitle: { fontSize: 20, fontWeight: '700', color: colors.text },
    searchContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      marginHorizontal: 16,
      marginTop: 12,
      paddingHorizontal: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 8,
    },
    searchInput: {
      flex: 1,
      paddingVertical: 12,
      fontSize: 14,
      color: colors.text,
    },
    filterTabs: { padding: 16, gap: 8, flexDirection: 'row' },
    filterTab: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 18,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    filterTabActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    filterTabText: { fontSize: 13, color: colors.text, fontWeight: '500' },
    filterTabTextActive: { color: '#fff' },
    emptyState: { alignItems: 'center', paddingVertical: 60 },
    emptyText: { fontSize: 14, color: colors.textSecondary, marginTop: 12 },
    userCard: {
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
    avatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.primary,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 12,
    },
    avatarText: { color: '#fff', fontSize: 18, fontWeight: '700' },
    userInfo: { flex: 1, minWidth: 0 },
    userNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
    userName: { fontSize: 15, fontWeight: '600', color: colors.text, flexShrink: 1 },
    userEmail: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
    userMeta: { flexDirection: 'row', gap: 10, marginTop: 6, flexWrap: 'wrap' },
    metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    metaText: { fontSize: 10, color: colors.textLight },
    miniBadge: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
    },
    miniBadgeText: { fontSize: 9, fontWeight: '700', color: '#fff' },
    modalOverlay: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0,0,0,0.5)',
    },
    modalContent: {
      backgroundColor: colors.background,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 20,
      maxHeight: '90%',
    },
    modalHandle: {
      width: 40,
      height: 4,
      backgroundColor: colors.border,
      borderRadius: 2,
      alignSelf: 'center',
      marginBottom: 16,
    },
    modalHeader: { alignItems: 'center', marginBottom: 20 },
    avatarLarge: {
      width: 70,
      height: 70,
      borderRadius: 35,
      backgroundColor: colors.primary,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 12,
    },
    avatarLargeText: { color: '#fff', fontSize: 28, fontWeight: '700' },
    modalUserName: { fontSize: 18, fontWeight: '700', color: colors.text },
    modalUserEmail: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
    badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
    badgeText: { fontSize: 10, fontWeight: '700', color: '#fff' },
    detailGrid: { flexDirection: 'row', gap: 8, marginBottom: 16 },
    detailStat: {
      flex: 1,
      backgroundColor: colors.surface,
      padding: 12,
      borderRadius: 12,
      alignItems: 'center',
    },
    detailStatValue: { fontSize: 18, fontWeight: '700', color: colors.text },
    detailStatLabel: { fontSize: 10, color: colors.textSecondary, marginTop: 3 },
    detailSection: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 14,
      marginBottom: 12,
    },
    detailSectionTitle: { fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 8 },
    detailRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 6,
    },
    detailRowLabel: { fontSize: 13, color: colors.textSecondary },
    detailRowValue: { fontSize: 13, color: colors.text },
    paymentRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
    },
    paymentAmount: { fontSize: 14, fontWeight: '600', color: colors.text },
    paymentDate: { fontSize: 11, color: colors.textLight, marginTop: 1 },
    paymentStatus: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
    paymentStatusText: { fontSize: 11, fontWeight: '600' },
    modalActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
    actionBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 14,
      borderRadius: 12,
      gap: 6,
    },
    actionBtnText: { fontSize: 14, fontWeight: '700' },
    closeBtn: {
      marginTop: 12,
      padding: 14,
      alignItems: 'center',
      borderRadius: 12,
      backgroundColor: colors.surface,
    },
    closeBtnText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  });
