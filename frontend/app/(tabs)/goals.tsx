import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  ActivityIndicator,
  TextInput,
  Modal,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../utils/api';
import { Goal } from '../../utils/types';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';

export default function GoalsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);
  const [addAmountModal, setAddAmountModal] = useState(false);
  const [amountToAdd, setAmountToAdd] = useState('');
  const [canAddMore, setCanAddMore] = useState(true);
  const [upgradeModalVisible, setUpgradeModalVisible] = useState(false);

  const styles = createStyles(colors);

  // Refresh data when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadGoals();
    }, [])
  );

  const loadGoals = async () => {
    try {
      const [goalsRes, countRes] = await Promise.all([
        api.get('/goals'),
        api.get('/goals/count')
      ]);
      setGoals(goalsRes.data);
      setCanAddMore(countRes.data.can_add_more);
    } catch (error: any) {
      console.error('Error loading goals:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadGoals();
  };

  const formatCurrency = (amount: number) => {
    return `${amount.toFixed(2)} zł`;
  };

  const handleAddAmount = async () => {
    if (!selectedGoal || !amountToAdd) return;

    const amount = parseFloat(amountToAdd);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Błąd', 'Wprowadź poprawną kwotę');
      return;
    }

    try {
      const newAmount = selectedGoal.current_amount + amount;
      await api.put(`/goals/${selectedGoal.id}`, {
        current_amount: newAmount,
      });

      setGoals(
        goals.map((g) =>
          g.id === selectedGoal.id
            ? { ...g, current_amount: newAmount, progress: (newAmount / g.target_amount) * 100 }
            : g
        )
      );

      setAddAmountModal(false);
      setAmountToAdd('');
      setSelectedGoal(null);
      Alert.alert('✅ Sukces', 'Kwota została dodana do celu');
    } catch (error) {
      Alert.alert('Błąd', 'Nie udało się dodać kwoty');
    }
  };

  const handleDeleteGoal = (goal: Goal) => {
    Alert.alert('Usuń cel', 'Czy na pewno chcesz usunąć ten cel?', [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Usuń',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/goals/${goal.id}`);
            setGoals(goals.filter((g) => g.id !== goal.id));
            // Reload to update canAddMore status
            loadGoals();
          } catch (error) {
            Alert.alert('Błąd', 'Nie udało się usunąć celu');
          }
        },
      },
    ]);
  };

  const openAddAmountModal = (goal: Goal) => {
    setSelectedGoal(goal);
    setAddAmountModal(true);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
        }
      >
        {/* Upgrade Banner when limit reached */}
        {!canAddMore && (
          <TouchableOpacity 
            style={styles.upgradeBanner}
            onPress={() => router.push('/pro/upgrade')}
          >
            <View style={styles.upgradeContent}>
              <Ionicons name="star" size={32} color={colors.warning} />
              <View style={styles.upgradeText}>
                <Text style={styles.upgradeTitle}>Odblokuj więcej celów!</Text>
                <Text style={styles.upgradeSubtitle}>
                  Wersja Pro: nieograniczona liczba celów oszczędnościowych
                </Text>
              </View>
              <Ionicons name="arrow-forward" size={24} color={colors.primary} />
            </View>
          </TouchableOpacity>
        )}

        {goals.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="flag-outline" size={64} color={colors.textLight} />
            <Text style={styles.emptyText}>Brak celów</Text>
            <Text style={styles.emptySubtext}>Utwórz swój pierwszy cel oszczędnościowy</Text>
          </View>
        ) : (
          goals.map((goal) => (
            <View key={goal.id} style={styles.goalCard}>
              <View style={styles.goalHeader}>
                <View style={styles.goalHeaderLeft}>
                  <View style={styles.goalIconContainer}>
                    <Ionicons name="flag" size={24} color={colors.primary} />
                  </View>
                  <Text style={styles.goalName}>{goal.name}</Text>
                </View>
                <TouchableOpacity onPress={() => handleDeleteGoal(goal)} style={styles.deleteButton}>
                  <Ionicons name="trash-outline" size={20} color={colors.error} />
                </TouchableOpacity>
              </View>

              <View style={styles.goalAmounts}>
                <Text style={styles.currentAmount}>{formatCurrency(goal.current_amount)}</Text>
                <Text style={styles.targetAmount}>/ {formatCurrency(goal.target_amount)}</Text>
              </View>

              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${Math.min(goal.progress, 100)}%`,
                      backgroundColor:
                        goal.progress >= 100
                          ? colors.success
                          : goal.progress >= 75
                          ? colors.primary
                          : colors.info,
                    },
                  ]}
                />
              </View>

              <View style={styles.goalFooter}>
                <Text style={styles.progressText}>{goal.progress.toFixed(0)}% osiągnięte</Text>
                {goal.deadline && (
                  <Text style={styles.deadlineText}>
                    {format(new Date(goal.deadline), 'dd MMM yyyy', { locale: pl })}
                  </Text>
                )}
              </View>

              <TouchableOpacity
                style={styles.addButton}
                onPress={() => openAddAmountModal(goal)}
              >
                <Ionicons name="add-circle" size={20} color={colors.primary} />
                <Text style={styles.addButtonText}>Dodaj kwotę</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
        
        {/* Bottom padding */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Add Amount Modal */}
      <Modal
        visible={addAmountModal}
        transparent
        animationType="fade"
        onRequestClose={() => setAddAmountModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Dodaj kwotę do celu</Text>
            <Text style={styles.modalSubtitle}>{selectedGoal?.name}</Text>

            <TextInput
              style={styles.modalInput}
              placeholder="Kwota"
              value={amountToAdd}
              onChangeText={setAmountToAdd}
              keyboardType="decimal-pad"
              placeholderTextColor={colors.textLight}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => {
                  setAddAmountModal(false);
                  setAmountToAdd('');
                  setSelectedGoal(null);
                }}
              >
                <Text style={styles.modalButtonTextCancel}>Anuluj</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonConfirm]}
                onPress={handleAddAmount}
              >
                <Text style={styles.modalButtonTextConfirm}>Dodaj</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* FAB - always green, shows upgrade modal if at limit */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => {
          if (!canAddMore) {
            setUpgradeModalVisible(true);
          } else {
            router.push('/goal/add');
          }
        }}
      >
        <Ionicons name="add" size={32} color="#fff" />
      </TouchableOpacity>

      {/* Upgrade Pro Modal */}
      <Modal
        visible={upgradeModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setUpgradeModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.upgradeModalContent}>
            <View style={styles.upgradeIconCircle}>
              <Ionicons name="star" size={36} color="#fff" />
            </View>
            <Text style={styles.upgradeModalTitle}>Upgrade do Pro</Text>
            <Text style={styles.upgradeModalText}>
              Wersja bezpłatna pozwala na 1 cel oszczędnościowy. Przejdź na wersję Pro, aby utworzyć nieograniczoną liczbę celów!
            </Text>

            <TouchableOpacity
              style={styles.upgradeProButton}
              onPress={() => {
                setUpgradeModalVisible(false);
                router.push('/pro/upgrade');
              }}
              activeOpacity={0.85}
            >
              <Ionicons name="star" size={20} color="#fff" />
              <Text style={styles.upgradeProButtonText}>Upgrade do Pro</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.upgradeCancelButton}
              onPress={() => setUpgradeModalVisible(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.upgradeCancelButtonText}>Anuluj</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
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
  goalCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  goalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  goalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  goalIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  goalName: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    flex: 1,
  },
  deleteButton: {
    padding: 8,
  },
  goalAmounts: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 14,
  },
  currentAmount: {
    fontSize: 30,
    fontWeight: 'bold',
    color: colors.primary,
  },
  targetAmount: {
    fontSize: 18,
    color: colors.textSecondary,
    marginLeft: 6,
  },
  progressBar: {
    height: 12,
    backgroundColor: colors.border,
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 14,
  },
  progressFill: {
    height: '100%',
    borderRadius: 6,
  },
  goalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  progressText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  deadlineText: {
    fontSize: 12,
    color: colors.textLight,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.primary,
    borderStyle: 'dashed',
  },
  addButtonText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
    marginLeft: 8,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    marginBottom: 20,
  },
  modalInput: {
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 16,
    fontSize: 18,
    color: colors.text,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modalButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  modalButtonCancel: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalButtonConfirm: {
    backgroundColor: colors.primary,
  },
  modalButtonTextCancel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  modalButtonTextConfirm: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  upgradeBanner: {
    backgroundColor: colors.warning + '15',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.warning,
    marginBottom: 16,
    overflow: 'hidden',
  },
  upgradeContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  upgradeText: {
    flex: 1,
    marginLeft: 14,
    marginRight: 8,
  },
  upgradeTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  upgradeSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },
  fabLocked: {
    backgroundColor: colors.textSecondary,
  },
  upgradeModalContent: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 28,
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
  },
  upgradeIconCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.warning,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
    shadowColor: colors.warning,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
  upgradeModalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 10,
    textAlign: 'center',
  },
  upgradeModalText: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  upgradeProButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2BB89B',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 24,
    width: '100%',
    marginBottom: 10,
    shadowColor: '#2BB89B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 5,
  },
  upgradeProButtonText: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#fff',
    marginLeft: 8,
  },
  upgradeCancelButton: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    width: '100%',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  upgradeCancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
  },
});
