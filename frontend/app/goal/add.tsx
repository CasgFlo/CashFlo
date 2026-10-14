import React, { useState } from 'react';
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
import DateTimePicker from '@react-native-community/datetimepicker';

export default function AddGoalScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [currentAmount, setCurrentAmount] = useState('');
  const [deadline, setDeadline] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const styles = createStyles(colors);

  const handleSubmit = async () => {
    if (!name.trim()) {
      Alert.alert('Błąd', 'Wprowadź nazwę celu');
      return;
    }

    const target = parseFloat(targetAmount);
    if (isNaN(target) || target <= 0) {
      Alert.alert('Błąd', 'Wprowadź poprawną kwotę docelową');
      return;
    }

    const current = currentAmount ? parseFloat(currentAmount) : 0;
    if (isNaN(current) || current < 0) {
      Alert.alert('Błąd', 'Wprowadź poprawną kwotę bieżącą');
      return;
    }

    setLoading(true);
    try {
      await api.post('/goals', {
        name: name.trim(),
        target_amount: target,
        current_amount: current,
        deadline: deadline?.toISOString(),
      });

      router.back();
      setTimeout(() => {
        Alert.alert('✅ Sukces', 'Cel został zapisany!');
      }, 300);
    } catch (error: any) {
      console.error('Error creating goal:', error);
      if (error.response?.status === 403) {
        Alert.alert(
          'Limit osiągnięty',
          'Wersja bezpłatna pozwala na 1 cel. Przejdź na wersję Pro aby mieć nieograniczoną liczbę celów!',
          [
            { text: 'Anuluj', style: 'cancel' },
            { text: 'Upgrade do Pro', onPress: () => router.push('/(tabs)/more') }
          ]
        );
      } else {
        Alert.alert('Błąd', 'Nie udało się utworzyć celu');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={[styles.contentContainer, { paddingBottom: insets.bottom + 20 }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
            hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
          >
            <Ionicons name="close" size={28} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Nowy cel</Text>
          <View style={{ width: 44 }} />
        </View>

        {/* Goal Name */}
        <View style={styles.section}>
          <Text style={styles.label}>Nazwa celu</Text>
          <TextInput
            style={styles.textInput}
            placeholder="np. Wakacje, Laptop, Samochód"
            value={name}
            onChangeText={setName}
            placeholderTextColor={colors.textLight}
          />
        </View>

        {/* Target Amount */}
        <View style={styles.section}>
          <Text style={styles.label}>Kwota docelowa</Text>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="0.00"
              value={targetAmount}
              onChangeText={setTargetAmount}
              keyboardType="decimal-pad"
              placeholderTextColor={colors.textLight}
            />
            <Text style={styles.currency}>zł</Text>
          </View>
        </View>

        {/* Current Amount */}
        <View style={styles.section}>
          <Text style={styles.label}>Kwota początkowa (opcjonalnie)</Text>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="0.00"
              value={currentAmount}
              onChangeText={setCurrentAmount}
              keyboardType="decimal-pad"
              placeholderTextColor={colors.textLight}
            />
            <Text style={styles.currency}>zł</Text>
          </View>
        </View>

        {/* Deadline */}
        <View style={styles.section}>
          <Text style={styles.label}>Termin (opcjonalnie)</Text>
          <TouchableOpacity
            style={styles.dateButton}
            onPress={() => setShowDatePicker(true)}
          >
            <Ionicons name="calendar-outline" size={24} color={colors.primary} />
            <Text style={styles.dateButtonText}>
              {deadline
                ? deadline.toLocaleDateString('pl-PL', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })
                : 'Wybierz termin'}
            </Text>
            {deadline && (
              <TouchableOpacity
                onPress={() => setDeadline(null)}
                style={styles.clearButton}
              >
                <Ionicons name="close-circle" size={20} color={colors.error} />
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        </View>

        {showDatePicker && (
          <DateTimePicker
            value={deadline || new Date()}
            mode="date"
            display="default"
            minimumDate={new Date()}
            onChange={(event, selectedDate) => {
              setShowDatePicker(Platform.OS === 'ios');
              if (selectedDate) {
                setDeadline(selectedDate);
              }
            }}
          />
        )}

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.submitButton, loading && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitButtonText}>Utwórz cel</Text>
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
  section: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  textInput: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
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
  },
  currency: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.textSecondary,
    marginLeft: 8,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dateButtonText: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    marginLeft: 12,
  },
  clearButton: {
    padding: 4,
  },
  submitButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 32,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
});
