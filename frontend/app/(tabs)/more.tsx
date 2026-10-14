import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { useTheme, ThemeColors } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { LargeTitle, Card, ProBadge, space, radius } from '../../components/ui';
import { confirmAction, showMessage } from '../../utils/confirm';
import { openSubscriptionPortal, PLAN_NAMES, ProPlan } from '../../utils/payments';
import { apiErrorMessage, isProLimitError } from '../../utils/format';
import { downloadExcelExport } from '../../utils/export';
import { promptPro } from '../../utils/pro';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export default function MoreScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark, toggleTheme } = useTheme();
  const { user, logout, refreshUser } = useAuth();
  const [portalBusy, setPortalBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const styles = createStyles(colors);
  const version = Constants.expoConfig?.version || '1.0.0';

  // Pick up Pro changes (e.g. after managing the subscription in the browser)
  useFocusEffect(
    useCallback(() => {
      refreshUser();
    }, [])
  );

  const handleLogout = () => {
    confirmAction('Wyloguj się', 'Czy na pewno chcesz się wylogować?', 'Wyloguj', async () => {
      await logout();
      router.replace('/auth/login');
    });
  };

  const manageSubscription = async () => {
    setPortalBusy(true);
    try {
      await openSubscriptionPortal();
      await refreshUser();
    } catch (error) {
      showMessage('Błąd', apiErrorMessage(error, 'Nie udało się otworzyć ustawień subskrypcji.'));
    } finally {
      setPortalBusy(false);
    }
  };

  const exportToExcel = async () => {
    if (!user?.is_pro) {
      promptPro('Pobierz wszystkie transakcje i podsumowania miesięcy w jednym pliku Excel. Eksport jest dostępny w CashFlo Pro.', () =>
        router.push('/pro/upgrade')
      );
      return;
    }
    setExportBusy(true);
    try {
      await downloadExcelExport();
    } catch (error) {
      if (isProLimitError(error)) {
        promptPro(apiErrorMessage(error, ''), () => router.push('/pro/upgrade'));
      } else {
        showMessage('Błąd', apiErrorMessage(error, 'Nie udało się przygotować pliku.'));
      }
    } finally {
      setExportBusy(false);
    }
  };

  const Row = ({
    icon,
    title,
    subtitle,
    onPress,
    right,
    first,
    tint,
  }: {
    icon: IconName;
    title: string;
    subtitle?: string;
    onPress?: () => void;
    right?: React.ReactNode;
    first?: boolean;
    tint?: string;
  }) => (
    <TouchableOpacity
      style={[styles.row, !first && styles.rowDivider]}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.rowIcon, { backgroundColor: (tint || colors.primary) + '1A' }]}>
        <Ionicons name={icon} size={18} color={tint || colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      {right !== undefined ? right : onPress ? <Ionicons name="chevron-forward" size={18} color={colors.textLight} /> : null}
    </TouchableOpacity>
  );

  const initial = (user?.name || user?.email || '?').trim().charAt(0).toUpperCase();
  const plan = user?.pro_plan as ProPlan | null | undefined;
  const proSubtitle = user?.is_pro
    ? plan === 'lifetime'
      ? 'Aktywne na zawsze'
      : plan
      ? `Aktywne · plan ${PLAN_NAMES[plan]}`
      : 'Aktywne'
    : 'Import bez limitu, pełne podsumowania, eksport';

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: insets.top + space.sm }]}>
      <LargeTitle title="Więcej" />

      {/* Profile */}
      <Card style={styles.profile}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>{user?.name}</Text>
          <Text style={styles.email} numberOfLines={1}>{user?.email}</Text>
        </View>
        {user?.is_pro ? (
          <View style={styles.proPill}>
            <Ionicons name="star" size={11} color={colors.onAccent} />
            <Text style={styles.proPillText}>PRO</Text>
          </View>
        ) : null}
      </Card>

      {/* Pro */}
      <Card style={[styles.group, !user?.is_pro && { borderColor: colors.accent }]}>
        <Row icon="star" tint={colors.warning} title="CashFlo Pro" subtitle={proSubtitle} onPress={() => router.push('/pro/upgrade')} first />
        {user?.can_manage_subscription ? (
          <Row
            icon="card-outline"
            title="Zarządzaj subskrypcją"
            subtitle="Zmień kartę albo anuluj"
            onPress={manageSubscription}
            right={portalBusy ? <ActivityIndicator color={colors.primary} /> : undefined}
          />
        ) : null}
      </Card>

      <Text style={styles.groupLabel}>Finanse</Text>
      <Card style={styles.group}>
        <Row icon="wallet-outline" title="Budżet miesięczny" onPress={() => router.push('/budget/settings')} first />
        <Row icon="repeat" title="Stałe płatności" subtitle="Rachunki i subskrypcje" onPress={() => router.push('/recurring')} />
        <Row icon="pricetags-outline" title="Kategorie" onPress={() => router.push('/categories/manage')} />
      </Card>

      <Text style={styles.groupLabel}>Twoje dane</Text>
      <Card style={styles.group}>
        <Row
          icon="cloud-upload-outline"
          title="Import z banku lub Excela"
          subtitle="Wgraj historię rachunku albo swój arkusz"
          onPress={() => router.push('/import')}
          first
        />
        <Row
          icon="download-outline"
          title="Eksport do Excela"
          subtitle="Wszystkie transakcje w jednym pliku"
          onPress={exportToExcel}
          right={
            exportBusy ? (
              <ActivityIndicator color={colors.primary} />
            ) : !user?.is_pro ? (
              <ProBadge />
            ) : undefined
          }
        />
      </Card>

      <Text style={styles.groupLabel}>Wygląd</Text>
      <Card style={styles.group}>
        <Row
          icon={isDark ? 'moon' : 'sunny-outline'}
          title="Tryb ciemny"
          first
          onPress={toggleTheme}
          right={
            <Switch
              value={isDark}
              onValueChange={toggleTheme}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#FFFFFF"
            />
          }
        />
      </Card>

      <Text style={styles.groupLabel}>Pomoc</Text>
      <Card style={styles.group}>
        <Row icon="help-circle-outline" title="Pomoc i kontakt" onPress={() => router.push('/support/contact')} first />
        <Row icon="document-text-outline" title="Regulamin" onPress={() => router.push('/terms')} />
        <Row icon="shield-checkmark-outline" title="Polityka prywatności" onPress={() => router.push('/privacy')} />
      </Card>

      {user?.is_admin ? (
        <>
          <Text style={styles.groupLabel}>Administracja</Text>
          <Card style={styles.group}>
            <Row icon="stats-chart-outline" tint={colors.info} title="Panel administratora" subtitle="Statystyki i użytkownicy" onPress={() => router.push('/admin')} first />
          </Card>
        </>
      ) : null}

      <TouchableOpacity style={styles.logout} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={20} color={colors.error} />
        <Text style={styles.logoutText}>Wyloguj się</Text>
      </TouchableOpacity>

      {/* Delete account (required by the App Store and GDPR) */}
      <TouchableOpacity style={styles.deleteAccount} onPress={() => router.push('/account/delete')}>
        <Text style={styles.deleteAccountText}>Usuń konto</Text>
      </TouchableOpacity>

      <Text style={styles.version}>CashFlo {version}</Text>
    </ScrollView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    content: { paddingHorizontal: space.lg, paddingBottom: space.xxl },
    profile: { flexDirection: 'row', alignItems: 'center' },
    avatar: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: space.md,
    },
    avatarText: { fontSize: 22, fontWeight: '800', color: colors.onPrimary },
    name: { fontSize: 17, fontWeight: '700', color: colors.text },
    email: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
    proPill: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.accent,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: radius.pill,
      marginLeft: space.sm,
    },
    proPillText: { fontSize: 11, fontWeight: '800', color: colors.onAccent, marginLeft: 3 },
    group: { paddingVertical: 2, paddingHorizontal: space.lg },
    groupLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textLight,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginTop: space.md,
      marginBottom: space.sm,
      marginLeft: space.xs,
    },
    row: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingVertical: space.sm },
    rowDivider: { borderTopWidth: 1, borderTopColor: colors.divider },
    rowIcon: {
      width: 34,
      height: 34,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: space.md,
    },
    rowTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
    rowSubtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 1 },
    logout: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 52,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      marginTop: space.xl,
    },
    logoutText: { fontSize: 16, fontWeight: '700', color: colors.error, marginLeft: space.sm },
    deleteAccount: { alignItems: 'center', padding: space.md, marginTop: space.sm },
    deleteAccountText: { fontSize: 14, color: colors.textSecondary, textDecorationLine: 'underline' },
    version: { fontSize: 12, color: colors.textLight, textAlign: 'center', marginTop: space.xs },
  });
