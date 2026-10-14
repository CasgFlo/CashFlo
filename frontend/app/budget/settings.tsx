import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';
import api from '../../utils/api';
import { Budget } from '../../utils/types';

export default function BudgetSettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [monthlyLimit, setMonthlyLimit] = useState('');
  const [budget, setBudget] = useState<Budget | null>(null);

  const styles = createStyles(colors);

  useEffect(() => {
    loadBudget();
  }, []);

  const loadBudget = async () => {
    try {
      const response = await api.get('/budget');
      setBudget(response.data);
      setMonthlyLimit(response.data.monthly_limit.toString());
    } catch (error: any) {
      // Budget doesn't exist yet
      console.log('No budget found');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    const limit = parseFloat(monthlyLimit);
    if (isNaN(limit) || limit <= 0) {
      Alert.alert('Błąd', 'Wprowadź poprawną kwotę');
      return;
    }

    setSaving(true);
    try {
      await api.post('/budget', {
        monthly_limit: limit,
        category_limits: budget?.category_limits || {},
      });

      // Success - close screen and show message
      router.back();
      setTimeout(() => {
        Alert.alert('✅ Sukces', 'Budżet został zapisany!');
      }, 300);
    } catch (error: any) {
      console.error('Error saving budget:', error);
      Alert.alert('Błąd', 'Nie udało się zapisać budżetu');
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return `${amount.toFixed(2)} zł`;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.contentContainer}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
            hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
          >
            <Ionicons name="arrow-back" size={28} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Budżet miesięczny</Text>
          <View style={{ width: 44 }} />
        </View>

        {/* Info Card */}
        <View style={styles.infoCard}>
          <Ionicons name="information-circle" size={24} color={colors.info} />
          <Text style={styles.infoText}>
            Ustaw miesięczny limit wydatków, aby lepiej kontrolować swoje finanse
          </Text>
        </View>

        {/* Current Spending */}
        {budget && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Aktualny miesiąc</Text>
            <View style={styles.spendingRow}>
              <Text style={styles.spendingLabel}>Wydano:</Text>
              <Text style={[styles.spendingAmount, { color: colors.expense }]}>
                {formatCurrency(budget.current_month_spending)}
              </Text>
            </View>
            {budget.monthly_limit > 0 && (
              <>
                <View style={styles.spendingRow}>
                  <Text style={styles.spendingLabel}>Limit:</Text>
                  <Text style={styles.spendingAmount}>
                    {formatCurrency(budget.monthly_limit)}
                  </Text>
                </View>
                <View style={styles.progressBar}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${Math.min(
                          (budget.current_month_spending / budget.monthly_limit) * 100,
                          100
                        )}%`,
                        backgroundColor:
                          budget.current_month_spending / budget.monthly_limit > 0.9
                            ? colors.error
                            : budget.current_month_spending / budget.monthly_limit > 0.7
                            ? colors.warning
                            : colors.success,
                      },
                    ]}
                  />
                </View>
              </>
            )}
          </View>
        )}

        {/* Budget Input */}
        <View style={styles.section}>
          <Text style={styles.label}>Miesięczny limit wydatków</Text>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="0.00"
              value={monthlyLimit}
              onChangeText={setMonthlyLimit}
              keyboardType="decimal-pad"
              placeholderTextColor={colors.textLight}
            />
            <Text style={styles.currency}>zł</Text>
          </View>
          <Text style={styles.hint}>
            Otrzymasz powiadomienie gdy zbliżysz się do limitu
          </Text>
        </View>

        {/* Save Button */}
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={24} color="#fff" />
              <Text style={styles.saveButtonText}>Zapisz budżet</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
    paddingTop: 8,
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: colors.info + '20',
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    marginLeft: 12,
    lineHeight: 20,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 16,
  },
  spendingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  spendingLabel: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  spendingAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
  },
  progressBar: {
    height: 8,
    backgroundColor: colors.border,
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 4,
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  section: {
    marginBottom: 32,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: {
    flex: 1,
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    paddingVertical: 16,
    outlineStyle: 'none' as any,
  },
  currency: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.textSecondary,
    marginLeft: 8,
  },
  hint: {
    fontSize: 12,
    color: colors.textLight,
    marginTop: 8,
  },
  saveButton: {
    flexDirection: 'row',
    backgroundColor: colors.primary,
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginLeft: 8,
  },
});
