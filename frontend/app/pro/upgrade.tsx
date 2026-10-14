import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, ThemeColors } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { ScreenHeader, Card, Button, space, radius } from '../../components/ui';
import { PRO_PLANS, PLAN_NAMES, ProPlan, startCheckout, openSubscriptionPortal } from '../../utils/payments';
import { apiErrorMessage } from '../../utils/format';
import { PRO_FEATURES } from '../../utils/pro';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

// Why people upgrade, in their words
const HIGHLIGHTS: { icon: IconName; text: string }[] = [
  { icon: 'cloud-upload-outline', text: 'Wgrywasz historię z banku i masz wszystko w minutę, bez przepisywania.' },
  { icon: 'repeat', text: 'Widzisz, ile naprawdę kosztują Cię subskrypcje i stałe opłaty w roku.' },
  { icon: 'bulb-outline', text: 'Co miesiąc dostajesz konkretne wnioski: co wzrosło i gdzie możesz odłożyć.' },
];

export default function ProUpgradeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { user } = useAuth();
  const [selectedPlan, setSelectedPlan] = useState<ProPlan>('yearly');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const styles = createStyles(colors);
  const plan = PRO_PLANS.find((p) => p.id === selectedPlan)!;

  const handlePurchase = async () => {
    setError(null);
    setBusy(true);
    try {
      const sessionId = await startCheckout(selectedPlan);
      if (sessionId) {
        router.replace({ pathname: '/pro/success', params: { session_id: sessionId } });
      }
    } catch (e) {
      setError(apiErrorMessage(e, 'Nie udało się otworzyć płatności. Spróbuj ponownie.'));
    } finally {
      setBusy(false);
    }
  };

  const handleManage = async () => {
    setError(null);
    setBusy(true);
    try {
      await openSubscriptionPortal();
    } catch (e) {
      setError(apiErrorMessage(e, 'Nie udało się otworzyć ustawień subskrypcji. Spróbuj ponownie.'));
    } finally {
      setBusy(false);
    }
  };

  const featureList = (
    <Card style={{ paddingVertical: space.sm }}>
      <View style={styles.tableHeader}>
        <Text style={[styles.tableHeadText, { flex: 1 }]}>Funkcja</Text>
        <Text style={[styles.tableHeadText, styles.colFree]}>Darmowy</Text>
        <Text style={[styles.tableHeadText, styles.colPro, { color: colors.primary }]}>Pro</Text>
      </View>
      {PRO_FEATURES.map((f) => (
        <View key={f.title} style={[styles.featureRow, styles.featureDivider]}>
          <View style={styles.featureIcon}>
            <Ionicons name={f.icon as IconName} size={16} color={colors.primary} />
          </View>
          <Text style={[styles.featureTitle, { flex: 1 }]}>{f.title}</Text>
          <Text style={[styles.colFree, styles.freeValue]}>{f.free}</Text>
          <Text style={[styles.colPro, styles.proValue]}>{f.pro}</Text>
        </View>
      ))}
    </Card>
  );

  if (user?.is_pro) {
    const proPlan = user.pro_plan as ProPlan | null | undefined;
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xl }]}>
          <ScreenHeader title="CashFlo Pro" onBack={() => router.back()} />
          <View style={styles.hero}>
            <View style={styles.heroIcon}>
              <Ionicons name="checkmark" size={30} color={colors.onAccent} />
            </View>
            <Text style={styles.heroTitle}>Masz CashFlo Pro</Text>
            <Text style={styles.heroText}>
              {proPlan === 'lifetime'
                ? 'Plan bezterminowy: Pro zostaje z Tobą na zawsze.'
                : proPlan
                ? `Plan ${PLAN_NAMES[proPlan]}. Dziękujemy za wsparcie!`
                : 'Wszystkie funkcje Pro są aktywne.'}
            </Text>
          </View>
          {featureList}
          {user.can_manage_subscription ? (
            <>
              <Button title="Zarządzaj subskrypcją" icon="card-outline" variant="secondary" onPress={handleManage} loading={busy} />
              <Text style={styles.note}>Zmienisz tam kartę albo anulujesz subskrypcję. Pro działa do końca opłaconego okresu.</Text>
            </>
          ) : null}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xl }]}>
        <ScreenHeader title="CashFlo Pro" onBack={() => router.back()} />

        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name="star" size={28} color={colors.onAccent} />
          </View>
          <Text style={styles.heroTitle}>Pełna kontrola nad pieniędzmi</Text>
          <Text style={styles.heroText}>Mniej wpisywania, więcej odpowiedzi na pytanie: gdzie znikają moje pieniądze?</Text>
        </View>

        <Card>
          {HIGHLIGHTS.map((h, i) => (
            <View key={h.text} style={[styles.highlightRow, i > 0 && styles.featureDivider]}>
              <Ionicons name={h.icon} size={20} color={colors.primary} style={{ marginTop: 1 }} />
              <Text style={styles.highlightText}>{h.text}</Text>
            </View>
          ))}
        </Card>

        {featureList}

        <Text style={styles.sectionLabel}>Wybierz plan</Text>
        {PRO_PLANS.map((p) => {
          const selected = p.id === selectedPlan;
          return (
            <TouchableOpacity
              key={p.id}
              activeOpacity={0.85}
              onPress={() => setSelectedPlan(p.id)}
              style={[styles.planCard, selected && styles.planCardSelected]}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
            >
              <View style={[styles.radio, selected && styles.radioSelected]}>
                {selected ? <View style={styles.radioDot} /> : null}
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.planTop}>
                  <Text style={styles.planName}>{p.name}</Text>
                  {p.badge ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{p.badge}</Text>
                    </View>
                  ) : null}
                </View>
                {p.note ? <Text style={styles.planNote}>{p.note}</Text> : null}
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.planPrice}>{p.price}</Text>
                <Text style={styles.planPeriod}>{p.period}</Text>
              </View>
            </TouchableOpacity>
          );
        })}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Button
          title={`Kup plan ${plan.name.toLowerCase()} · ${plan.price}`}
          onPress={handlePurchase}
          loading={busy}
          style={{ marginTop: space.md }}
        />

        <Text style={styles.note}>
          Płatność obsługuje Stripe; dostępne metody zobaczysz na następnym ekranie.
          {selectedPlan !== 'lifetime'
            ? ' Subskrypcja odnawia się automatycznie. Anulujesz ją w każdej chwili w aplikacji: Więcej → CashFlo Pro.'
            : ''}
        </Text>

        <Card style={styles.guarantee}>
          <Ionicons name="shield-checkmark-outline" size={22} color={colors.success} />
          <Text style={styles.guaranteeText}>
            Masz 14 dni na zwrot pieniędzy, jeśli nie zaczniesz korzystać z funkcji Pro. Napisz na cashflo2026@gmail.com. Szczegóły w Regulaminie.
          </Text>
        </Card>

        <View style={styles.legalRow}>
          <Text style={styles.legalText}>Kupując, akceptujesz </Text>
          <TouchableOpacity onPress={() => router.push('/terms')}>
            <Text style={styles.legalLink}>Regulamin</Text>
          </TouchableOpacity>
          <Text style={styles.legalText}> i </Text>
          <TouchableOpacity onPress={() => router.push('/privacy')}>
            <Text style={styles.legalLink}>Politykę prywatności</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    content: { paddingHorizontal: space.lg },
    hero: { alignItems: 'center', paddingVertical: space.lg },
    heroIcon: {
      width: 60,
      height: 60,
      borderRadius: 30,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: space.md,
    },
    heroTitle: { fontSize: 26, fontWeight: '800', color: colors.text, letterSpacing: -0.4, textAlign: 'center' },
    heroText: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', marginTop: space.sm, lineHeight: 21, maxWidth: 320 },
    tableHeader: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.sm },
    tableHeadText: { fontSize: 12, fontWeight: '700', color: colors.textLight, textTransform: 'uppercase', letterSpacing: 0.5 },
    colFree: { width: 72, textAlign: 'center' },
    colPro: { width: 84, textAlign: 'center' },
    freeValue: { fontSize: 13, color: colors.textSecondary },
    proValue: { fontSize: 13, fontWeight: '800', color: colors.primary },
    featureRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.md },
    featureDivider: { borderTopWidth: 1, borderTopColor: colors.divider },
    featureIcon: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: colors.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: space.sm,
    },
    featureTitle: { fontSize: 14, fontWeight: '600', color: colors.text },
    highlightRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: space.md },
    highlightText: { flex: 1, fontSize: 15, color: colors.text, lineHeight: 21, marginLeft: space.md },
    sectionLabel: { fontSize: 17, fontWeight: '700', color: colors.text, marginTop: space.md, marginBottom: space.md },
    planCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: space.lg,
      marginBottom: space.sm,
    },
    planCardSelected: { borderColor: colors.primary, borderWidth: 2, padding: space.lg - 1 },
    radio: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 2,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: space.md,
    },
    radioSelected: { borderColor: colors.primary },
    radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
    planTop: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
    planName: { fontSize: 16, fontWeight: '700', color: colors.text, marginRight: space.sm },
    badge: { backgroundColor: colors.accent, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
    badgeText: { fontSize: 11, fontWeight: '800', color: colors.onAccent },
    planNote: { fontSize: 12, color: colors.textSecondary, marginTop: 3, marginRight: space.sm },
    planPrice: { fontSize: 17, fontWeight: '800', color: colors.text },
    planPeriod: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
    errorText: { color: colors.error, fontSize: 14, marginTop: space.sm },
    note: { fontSize: 12, color: colors.textSecondary, lineHeight: 18, marginTop: space.md, textAlign: 'center' },
    guarantee: { flexDirection: 'row', alignItems: 'center', marginTop: space.lg },
    guaranteeText: { flex: 1, fontSize: 13, color: colors.text, marginLeft: space.md, lineHeight: 19 },
    legalRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: space.md },
    legalText: { fontSize: 12, color: colors.textSecondary },
    legalLink: { fontSize: 12, color: colors.primary, fontWeight: '600', textDecorationLine: 'underline' },
  });
