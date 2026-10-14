import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { useTheme, ThemeColors } from '../../contexts/ThemeContext';
import api from '../../utils/api';
import { parseAmount, sanitizeAmountInput, apiErrorMessage } from '../../utils/format';
import { ScreenHeader, Button, space, radius, tabular } from '../../components/ui';

const atNoon = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0);

export default function AddGoalScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  const [name, setName] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [currentAmount, setCurrentAmount] = useState('');
  const [deadline, setDeadline] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const handleSubmit = async () => {
    setError(null);
    if (!name.trim()) {
      setError('Nazwij swój cel, np. „Wakacje”.');
      return;
    }
    const target = parseAmount(targetAmount);
    if (!Number.isFinite(target) || target <= 0) {
      setError('Wpisz kwotę, którą chcesz odłożyć.');
      return;
    }
    const current = currentAmount ? parseAmount(currentAmount) : 0;
    if (!Number.isFinite(current) || current < 0) {
      setError('Kwota początkowa jest nieprawidłowa.');
      return;
    }

    setSaving(true);
    try {
      await api.post('/goals', {
        name: name.trim(),
        target_amount: target,
        current_amount: current,
        deadline: deadline ? deadline.toISOString() : null,
      });
      router.back();
    } catch (e: any) {
      if (e.response?.status === 403) setLimitReached(true);
      setError(apiErrorMessage(e, 'Nie udało się zapisać celu. Spróbuj ponownie.'));
    } finally {
      setSaving(false);
    }
  };

  const onPickDate = (_event: any, picked?: Date) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (picked) setDeadline(atNoon(picked));
  };

  return (
    <KeyboardAvoidingView style={[styles.screen, { paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xl }]} keyboardShouldPersistTaps="handled">
        <ScreenHeader title="Nowy cel" icon="close" onBack={() => router.back()} />

        <Text style={styles.label}>Na co odkładasz?</Text>
        <TextInput
          style={styles.textInput}
          placeholder="np. Wakacje, poduszka finansowa, laptop"
          value={name}
          onChangeText={(t) => {
            setName(t);
            setError(null);
          }}
          maxLength={60}
          autoFocus
          placeholderTextColor={colors.textLight}
        />

        <Text style={styles.label}>Ile chcesz odłożyć?</Text>
        <View style={styles.amountBox}>
          <TextInput
            style={[styles.amountInput, tabular]}
            placeholder="0"
            value={targetAmount}
            onChangeText={(t) => {
              setTargetAmount(sanitizeAmountInput(t));
              setError(null);
            }}
            keyboardType="decimal-pad"
            placeholderTextColor={colors.textLight}
          />
          <Text style={styles.currency}>zł</Text>
        </View>

        <Text style={styles.label}>Ile już masz? (opcjonalnie)</Text>
        <View style={styles.amountBox}>
          <TextInput
            style={[styles.amountInput, tabular]}
            placeholder="0"
            value={currentAmount}
            onChangeText={(t) => {
              setCurrentAmount(sanitizeAmountInput(t));
              setError(null);
            }}
            keyboardType="decimal-pad"
            placeholderTextColor={colors.textLight}
          />
          <Text style={styles.currency}>zł</Text>
        </View>

        {Platform.OS !== 'web' ? (
          <>
            <Text style={styles.label}>Do kiedy? (opcjonalnie)</Text>
            <TouchableOpacity style={styles.dateButton} onPress={() => setShowDatePicker(true)}>
              <Ionicons name="calendar-outline" size={20} color={colors.primary} />
              <Text style={styles.dateText}>{deadline ? format(deadline, 'd MMMM yyyy', { locale: pl }) : 'Wybierz termin'}</Text>
              {deadline ? (
                <TouchableOpacity onPress={() => setDeadline(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Usuń termin">
                  <Ionicons name="close-circle" size={20} color={colors.textLight} />
                </TouchableOpacity>
              ) : null}
            </TouchableOpacity>
          </>
        ) : null}

        {showDatePicker && Platform.OS === 'android' ? (
          <DateTimePicker value={deadline || new Date()} mode="date" minimumDate={new Date()} onChange={onPickDate} />
        ) : null}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {limitReached ? (
          <Button title="Zobacz CashFlo Pro" variant="secondary" icon="star" onPress={() => router.push('/pro/upgrade')} style={{ marginTop: space.md }} />
        ) : null}

        <Button title="Utwórz cel" onPress={handleSubmit} loading={saving} style={{ marginTop: space.xl }} />
      </ScrollView>

      {Platform.OS === 'ios' ? (
        <Modal visible={showDatePicker} transparent animationType="slide" onRequestClose={() => setShowDatePicker(false)}>
          <View style={styles.overlay}>
            <View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }]}>
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>Termin celu</Text>
                <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                  <Text style={styles.sheetDone}>Gotowe</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker value={deadline || new Date()} mode="date" display="inline" minimumDate={new Date()} onChange={onPickDate} locale="pl-PL" />
            </View>
          </View>
        </Modal>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    content: { paddingHorizontal: space.lg },
    label: { fontSize: 14, fontWeight: '700', color: colors.textSecondary, marginTop: space.lg, marginBottom: space.sm },
    textInput: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: space.lg,
      paddingVertical: 14,
      fontSize: 16,
      color: colors.text,
    },
    amountBox: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: space.lg,
    },
    amountInput: { flex: 1, minWidth: 0, fontSize: 24, fontWeight: '800', color: colors.text, paddingVertical: 12 },
    currency: { fontSize: 18, fontWeight: '700', color: colors.textSecondary },
    dateButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: space.lg,
      minHeight: 52,
    },
    dateText: { flex: 1, fontSize: 16, color: colors.text, marginLeft: space.md },
    errorText: { color: colors.error, fontSize: 14, marginTop: space.lg },
    overlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: colors.background,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      paddingHorizontal: space.lg,
      paddingTop: space.lg,
    },
    sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.md },
    sheetTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
    sheetDone: { fontSize: 16, fontWeight: '700', color: colors.primary },
  });
