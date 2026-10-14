import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, ThemeColors } from '../../contexts/ThemeContext';
import api from '../../utils/api';
import { Budget } from '../../utils/types';
import { formatCurrency, parseAmount, sanitizeAmountInput, apiErrorMessage } from '../../utils/format';
import { ScreenHeader, Card, Button, ProgressBar, space, radius, tabular } from '../../components/ui';

export default function BudgetSettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [monthlyLimit, setMonthlyLimit] = useState('');
  const [budget, setBudget] = useState<Budget | null>(null);

  useEffect(() => {
    loadBudget();
  }, []);

  const loadBudget = async () => {
    try {
      const response = await api.get('/budget');
      setBudget(response.data);
      if (response.data.monthly_limit > 0) {
        setMonthlyLimit(response.data.monthly_limit.toFixed(2).replace('.', ',').replace(/,00$/, ''));
      }
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
    setError(null);
    setSaving(true);
    try {
      await api.post('/budget', { monthly_limit: limit, category_limits: budget?.category_limits || {} });
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
    amountInput: { flex: 1, fontSize: 28, fontWeight: '800', color: colors.text, paddingVertical: 12 },
    currency: { fontSize: 20, fontWeight: '700', color: colors.textSecondary },
    errorText: { color: colors.error, fontSize: 14, marginTop: space.md },
  });
