import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, ThemeColors } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../utils/api';
import { Budget, Category } from '../../utils/types';
import { formatCurrency, parseAmount, sanitizeAmountInput, apiErrorMessage } from '../../utils/format';
import { ScreenHeader, Card, Button, ProgressBar, LockedCard, ProBadge, space, radius, tabular } from '../../components/ui';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const toInput = (value: number) => value.toFixed(2).replace('.', ',').replace(/,00$/, '');

export default function BudgetSettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { user } = useAuth();
  const styles = createStyles(colors);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [monthlyLimit, setMonthlyLimit] = useState('');
  const [budget, setBudget] = useState<Budget | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [limits, setLimits] = useState<Record<string, string>>({});
  const isPro = !!user?.is_pro;

  useEffect(() => {
    loadBudget();
  }, []);

  const loadBudget = async () => {
    try {
      const categoriesRes = await api.get('/categories');
      setCategories((categoriesRes.data as Category[]).filter((c) => (c.type || 'expense') === 'expense'));
    } catch {
      // Categories are only needed for the limits
    }
    try {
      const response = await api.get('/budget');
      const b: Budget = response.data;
      setBudget(b);
      if (b.monthly_limit > 0) setMonthlyLimit(toInput(b.monthly_limit));
      const entries: Record<string, string> = {};
      for (const [name, value] of Object.entries(b.category_limits || {})) entries[name] = toInput(value);
      setLimits(entries);
    } catch {
      // No budget yet
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    const limit = parseAmount(monthlyLimit);
    if (!Number.isFinite(limit) || limit <= 0) {
      setError('Wpisz kwotę, np. 3000.');
      return;
    }
    const categoryLimits: Record<string, number> = {};
    if (isPro) {
      for (const [name, text] of Object.entries(limits)) {
        if (!text.trim()) continue;
        const value = parseAmount(text);
        if (!Number.isFinite(value) || value <= 0) {
          setError(`Sprawdź limit dla kategorii „${name}”.`);
          return;
        }
        categoryLimits[name] = value;
      }
    }
    setError(null);
    setSaving(true);
    try {
      await api.post('/budget', { monthly_limit: limit, category_limits: isPro ? categoryLimits : null });
      router.back();
    } catch (e) {
      setError(apiErrorMessage(e, 'Nie udało się zapisać budżetu. Spróbuj ponownie.'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.screen, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const used = budget && budget.monthly_limit > 0 ? budget.current_month_spending / budget.monthly_limit : 0;

  return (
    <KeyboardAvoidingView style={[styles.screen, { paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xl }]} keyboardShouldPersistTaps="handled">
        <ScreenHeader title="Budżet miesięczny" onBack={() => router.back()} />

        <Text style={styles.intro}>
          Ustal, ile chcesz wydawać miesięcznie. Na ekranie głównym zobaczysz, ile zostało do końca miesiąca.
        </Text>

        {budget && budget.monthly_limit > 0 ? (
          <Card>
            <Text style={styles.cardLabel}>Ten miesiąc</Text>
            <Text style={[styles.spent, tabular]}>
              {formatCurrency(budget.current_month_spending)}
              <Text style={styles.of}> z {formatCurrency(budget.monthly_limit)}</Text>
            </Text>
            <ProgressBar value={used} color={used > 0.9 ? colors.error : used > 0.7 ? colors.warning : colors.primary} />
          </Card>
        ) : null}

        <Text style={styles.label}>Miesięczny limit wydatków</Text>
        <View style={styles.amountBox}>
          <TextInput
            style={[styles.amountInput, tabular]}
            placeholder="0"
            value={monthlyLimit}
            onChangeText={(t) => {
              setMonthlyLimit(sanitizeAmountInput(t));
              setError(null);
            }}
            keyboardType="decimal-pad"
            autoFocus={!budget}
            placeholderTextColor={colors.textLight}
          />
          <Text style={styles.currency}>zł</Text>
        </View>

        {/* Limits per category (Pro) */}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Limity dla kategorii</Text>
          {!isPro ? <ProBadge /> : null}
        </View>
        {isPro ? (
          <>
            <Text style={styles.sectionHint}>Zostaw puste, jeśli kategoria nie ma limitu. Zobaczysz ostrzeżenie, gdy zbliżysz się do granicy.</Text>
            <Card style={{ paddingVertical: space.xs }}>
              {categories.map((c, index) => {
                const limitValue = parseAmount(limits[c.name] || '');
                const spent = budget?.category_spending?.[c.name] ?? 0;
                const share = Number.isFinite(limitValue) && limitValue > 0 ? spent / limitValue : 0;
                return (
                  <View key={c.id} style={[styles.limitRow, index > 0 && styles.divider]}>
                    <View style={styles.limitTop}>
                      <View style={[styles.limitIcon, { backgroundColor: c.color + '1F' }]}>
                        <Ionicons name={(c.icon as IconName) || 'ellipse'} size={16} color={c.color} />
                      </View>
                      <Text style={styles.limitName} numberOfLines={1}>{c.name}</Text>
                      <View style={styles.limitInputBox}>
                        <TextInput
                          style={[styles.limitInput, tabular]}
                          value={limits[c.name] || ''}
                          onChangeText={(t) => setLimits((current) => ({ ...current, [c.name]: sanitizeAmountInput(t) }))}
                          placeholder="bez limitu"
                          placeholderTextColor={colors.textLight}
                          keyboardType="decimal-pad"
                        />
                        {limits[c.name] ? <Text style={styles.limitCurrency}>zł</Text> : null}
                      </View>
                    </View>
                    {share > 0 && budget?.category_limits?.[c.name] ? (
                      <View style={styles.limitProgress}>
                        <ProgressBar value={share} color={share >= 1 ? colors.error : share >= 0.8 ? colors.warning : c.color} />
                        <Text style={[styles.limitSpent, tabular]}>
                          W tym miesiącu {formatCurrency(spent)} ({Math.round(share * 100)}%)
                        </Text>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </Card>
          </>
        ) : (
          <LockedCard
            title="Pilnuj wydatków w każdej kategorii"
            text="Ustaw np. 800 zł na jedzenie i 200 zł na rozrywkę. Na ekranie głównym zobaczysz, gdy zbliżysz się do limitu."
            onPress={() => router.push('/pro/upgrade')}
          />
        )}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <Button title="Zapisz budżet" onPress={handleSave} loading={saving} style={{ marginTop: space.xl }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    content: { paddingHorizontal: space.lg },
    intro: { fontSize: 15, color: colors.textSecondary, lineHeight: 21, marginBottom: space.lg },
    cardLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
    spent: { fontSize: 22, fontWeight: '800', color: colors.text, marginTop: 4, marginBottom: space.md },
    of: { fontSize: 14, fontWeight: '500', color: colors.textSecondary },
    label: { fontSize: 14, fontWeight: '700', color: colors.textSecondary, marginTop: space.md, marginBottom: space.sm },
    amountBox: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: space.lg,
    },
    amountInput: { flex: 1, minWidth: 0, fontSize: 28, fontWeight: '800', color: colors.text, paddingVertical: 12 },
    currency: { fontSize: 20, fontWeight: '700', color: colors.textSecondary },
    sectionRow: { flexDirection: 'row', alignItems: 'center', marginTop: space.xl, marginBottom: space.sm },
    sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.text, marginRight: space.sm },
    sectionHint: { fontSize: 13, color: colors.textSecondary, lineHeight: 18, marginBottom: space.md },
    limitRow: { paddingVertical: space.md },
    divider: { borderTopWidth: 1, borderTopColor: colors.divider },
    limitTop: { flexDirection: 'row', alignItems: 'center' },
    limitIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginRight: space.md },
    limitName: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
    limitInputBox: {
      flexDirection: 'row',
      alignItems: 'center',
      width: 120,
      backgroundColor: colors.surfaceAlt,
      borderRadius: radius.sm,
      paddingHorizontal: space.sm,
    },
    limitInput: { flex: 1, minWidth: 0, fontSize: 15, fontWeight: '700', color: colors.text, paddingVertical: 8, textAlign: 'right' },
    limitCurrency: { fontSize: 14, color: colors.textSecondary, marginLeft: 4 },
    limitProgress: { marginTop: space.sm, marginLeft: 44 },
    limitSpent: { fontSize: 12, color: colors.textSecondary, marginTop: 4 },
    errorText: { color: colors.error, fontSize: 14, marginTop: space.md },
  });
