import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format, differenceInCalendarDays } from 'date-fns';
import { pl } from 'date-fns/locale';
import { useTheme, ThemeColors } from '../../contexts/ThemeContext';
import api from '../../utils/api';
import { Goal } from '../../utils/types';
import { formatCurrency, parseAmount, sanitizeAmountInput, apiErrorMessage, parseServerDate } from '../../utils/format';
import { confirmAction, showMessage } from '../../utils/confirm';
import { LargeTitle, Card, ProgressBar, Fab, EmptyState, Button, IconBubble, tabular, space, radius } from '../../components/ui';

export default function GoalsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);
  const [amountToAdd, setAmountToAdd] = useState('');
  const [amountError, setAmountError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [canAddMore, setCanAddMore] = useState(true);
  const [upgradeModalVisible, setUpgradeModalVisible] = useState(false);

  const styles = createStyles(colors);

  useFocusEffect(
    useCallback(() => {
      loadGoals();
    }, [])
  );

  const loadGoals = async () => {
    try {
      const [goalsRes, countRes] = await Promise.all([api.get('/goals'), api.get('/goals/count')]);
      setGoals(goalsRes.data);
      setCanAddMore(countRes.data.can_add_more);
    } catch (error) {
      console.error('Error loading goals:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const closeAddAmount = () => {
    setSelectedGoal(null);
    setAmountToAdd('');
    setAmountError(null);
  };

  const handleAddAmount = async () => {
    if (!selectedGoal) return;
    const amount = parseAmount(amountToAdd);
    if (!Number.isFinite(amount) || amount <= 0) {
      setAmountError('Wpisz kwotę, np. 150 albo 49,99.');
      return;
    }

    setSaving(true);
    try {
      const newAmount = Math.round((selectedGoal.current_amount + amount) * 100) / 100;
      await api.put(`/goals/${selectedGoal.id}`, { current_amount: newAmount });
      setGoals((current) =>
        current.map((g) =>
          g.id === selectedGoal.id ? { ...g, current_amount: newAmount, progress: (newAmount / g.target_amount) * 100 } : g
        )
      );
      closeAddAmount();
    } catch (error) {
      setAmountError(apiErrorMessage(error, 'Nie udało się zapisać kwoty. Spróbuj ponownie.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteGoal = (goal: Goal) => {
    confirmAction('Usuń cel', `Usunąć cel „${goal.name}”? Tego nie da się cofnąć.`, 'Usuń', async () => {
      try {
        await api.delete(`/goals/${goal.id}`);
        loadGoals();
      } catch (error) {
        showMessage('Błąd', 'Nie udało się usunąć celu.');
      }
    });
  };

  const onAddGoal = () => {
    if (!canAddMore) setUpgradeModalVisible(true);
    else router.push('/goal/add');
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const totalSaved = goals.reduce((sum, g) => sum + g.current_amount, 0);

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space.sm }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadGoals();
            }}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <LargeTitle
          title="Cele"
          subtitle={goals.length > 0 ? `Odłożone łącznie: ${formatCurrency(totalSaved)}` : 'Na co odkładasz?'}
        />

        {!canAddMore ? (
          <TouchableOpacity activeOpacity={0.85} onPress={() => router.push('/pro/upgrade')}>
            <Card style={styles.upgradeBanner}>
              <Ionicons name="star" size={20} color={colors.warning} />
              <Text style={styles.upgradeText}>Więcej celów odblokujesz w CashFlo Pro.</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
            </Card>
          </TouchableOpacity>
        ) : null}

        {goals.length === 0 ? (
          <EmptyState
            icon="flag-outline"
            title="Nie masz jeszcze celu"
            text="Poduszka finansowa, wakacje, nowy telefon. Ustaw kwotę i obserwuj, jak rośnie."
            actionLabel="Utwórz cel"
            onAction={onAddGoal}
          />
        ) : (
          goals.map((goal) => {
            const done = goal.progress >= 100;
            const left = Math.max(goal.target_amount - goal.current_amount, 0);
            const deadline = goal.deadline ? parseServerDate(goal.deadline) : null;
            const daysLeft = deadline ? differenceInCalendarDays(deadline, new Date()) : null;
            return (
              <Card key={goal.id}>
                <View style={styles.goalHeader}>
                  <IconBubble name={done ? 'checkmark' : 'flag'} color={done ? colors.success : colors.primary} size={40} />
                  <View style={styles.goalTitleBox}>
                    <Text style={styles.goalName} numberOfLines={2}>{goal.name}</Text>
                    {deadline ? (
                      <Text style={styles.goalMeta}>
                        do {format(deadline, 'd MMM yyyy', { locale: pl })}
                        {daysLeft !== null && daysLeft >= 0 && !done ? ` · zostało ${daysLeft} dni` : ''}
                      </Text>
                    ) : null}
                  </View>
                  <TouchableOpacity
                    onPress={() => handleDeleteGoal(goal)}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    accessibilityLabel={`Usuń cel ${goal.name}`}
                  >
                    <Ionicons name="trash-outline" size={20} color={colors.textLight} />
                  </TouchableOpacity>
                </View>

                <View style={styles.amountRow}>
                  <Text style={[styles.currentAmount, tabular]}>{formatCurrency(goal.current_amount)}</Text>
                  <Text style={[styles.targetAmount, tabular]}> z {formatCurrency(goal.target_amount)}</Text>
                </View>
                <ProgressBar value={goal.progress / 100} color={done ? colors.success : colors.primary} />
                <View style={styles.goalFooter}>
                  <Text style={[styles.goalMeta, tabular]}>{Math.min(goal.progress, 100).toFixed(0)}%</Text>
                  <Text style={[styles.goalMeta, tabular]}>{done ? 'Cel osiągnięty' : `Brakuje ${formatCurrency(left)}`}</Text>
                </View>

                {!done ? (
                  <Button
                    title="Odłóż kwotę"
                    icon="add"
                    variant="secondary"
                    onPress={() => setSelectedGoal(goal)}
                    style={{ marginTop: space.md }}
                  />
                ) : null}
              </Card>
            );
          })
        )}
      </ScrollView>

      {goals.length > 0 ? <Fab onPress={onAddGoal} label="Nowy cel" /> : null}

      {/* Add amount sheet */}
      <Modal visible={!!selectedGoal} transparent animationType="slide" onRequestClose={closeAddAmount}>
        <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }]}>
            <Text style={styles.sheetTitle}>Odłóż na cel</Text>
            <Text style={styles.sheetSubtitle}>{selectedGoal?.name}</Text>
            <View style={styles.sheetInputBox}>
              <TextInput
                style={[styles.sheetInput, tabular]}
                placeholder="0"
                value={amountToAdd}
                onChangeText={(t) => {
                  setAmountToAdd(sanitizeAmountInput(t));
                  setAmountError(null);
                }}
                keyboardType="decimal-pad"
                autoFocus
                placeholderTextColor={colors.textLight}
              />
              <Text style={styles.sheetCurrency}>zł</Text>
            </View>
            {amountError ? <Text style={styles.errorText}>{amountError}</Text> : null}
            <View style={styles.sheetButtons}>
              <Button title="Anuluj" variant="secondary" onPress={closeAddAmount} style={{ flex: 1 }} />
              <Button title="Zapisz" onPress={handleAddAmount} loading={saving} style={{ flex: 1 }} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Pro limit */}
      <Modal visible={upgradeModalVisible} transparent animationType="fade" onRequestClose={() => setUpgradeModalVisible(false)}>
        <View style={styles.overlayCenter}>
          <View style={styles.dialog}>
            <View style={styles.dialogIcon}>
              <Ionicons name="star" size={28} color={colors.onAccent} />
            </View>
            <Text style={styles.dialogTitle}>Więcej celów w Pro</Text>
            <Text style={styles.dialogText}>
              W wersji darmowej możesz mieć 1 cel oszczędnościowy. Z CashFlo Pro dodasz ich tyle, ile chcesz.
            </Text>
            <Button
              title="Zobacz CashFlo Pro"
              onPress={() => {
                setUpgradeModalVisible(false);
                router.push('/pro/upgrade');
              }}
              style={{ alignSelf: 'stretch' }}
            />
            <Button title="Nie teraz" variant="ghost" onPress={() => setUpgradeModalVisible(false)} style={{ alignSelf: 'stretch', marginTop: space.xs }} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
    content: { paddingHorizontal: space.lg, paddingBottom: 120 },
    upgradeBanner: { flexDirection: 'row', alignItems: 'center', borderColor: colors.accent },
    upgradeText: { flex: 1, marginHorizontal: space.sm, fontSize: 14, fontWeight: '600', color: colors.text },
    goalHeader: { flexDirection: 'row', alignItems: 'center' },
    goalTitleBox: { flex: 1, marginHorizontal: space.md },
    goalName: { fontSize: 16, fontWeight: '700', color: colors.text },
    goalMeta: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
    amountRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: space.lg, marginBottom: space.sm },
    currentAmount: { fontSize: 22, fontWeight: '800', color: colors.text },
    targetAmount: { fontSize: 14, color: colors.textSecondary },
    goalFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.xs },
    overlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
    overlayCenter: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', padding: space.xl },
    sheet: {
      backgroundColor: colors.background,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      paddingHorizontal: space.xl,
      paddingTop: space.xl,
    },
    sheetTitle: { fontSize: 20, fontWeight: '800', color: colors.text },
    sheetSubtitle: { fontSize: 14, color: colors.textSecondary, marginTop: 2, marginBottom: space.lg },
    sheetInputBox: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: radius.md,
      paddingHorizontal: space.lg,
    },
    sheetInput: { flex: 1, minWidth: 0, fontSize: 28, fontWeight: '800', color: colors.text, paddingVertical: space.md },
    sheetCurrency: { fontSize: 20, fontWeight: '700', color: colors.textSecondary },
    errorText: { color: colors.error, fontSize: 14, marginTop: space.sm },
    sheetButtons: { flexDirection: 'row', gap: space.md, marginTop: space.lg },
    dialog: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: space.xl,
      alignItems: 'center',
    },
    dialogIcon: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: space.md,
    },
    dialogTitle: { fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: space.sm },
    dialogText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: space.lg },
  });
