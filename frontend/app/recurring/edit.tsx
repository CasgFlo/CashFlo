import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  TouchableOpacity,
  Switch,
  Modal,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { addDays, addMonths, isSameDay, format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { useTheme, ThemeColors } from '../../contexts/ThemeContext';
import api from '../../utils/api';
import { Category, Frequency, RecurringPayment } from '../../utils/types';
import { apiErrorMessage, isProLimitError, parseAmount, parseServerDate, sanitizeAmountInput, formatCurrency } from '../../utils/format';
import { confirmAction } from '../../utils/confirm';
import { promptPro } from '../../utils/pro';
import { ScreenHeader, SegmentedControl, Chip, Button, space, radius, tabular } from '../../components/ui';

type TxType = 'expense' | 'income';

const atNoon = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0);

export default function RecurringEditScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const editId = typeof params.id === 'string' && params.id ? params.id : null;
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = createStyles(colors);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);

  const [type, setType] = useState<TxType>('expense');
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [frequency, setFrequency] = useState<Frequency>('monthly');
  const [nextDate, setNextDate] = useState<Date>(atNoon(new Date()));
  const [isSubscription, setIsSubscription] = useState(false);
  const [active, setActive] = useState(true);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const filtered = useMemo(() => categories.filter((c) => (c.type || 'expense') === type), [categories, type]);

  useEffect(() => {
    (async () => {
      try {
        const [categoriesRes, listRes] = await Promise.all([api.get('/categories'), editId ? api.get('/recurring') : Promise.resolve(null)]);
        const cats: Category[] = categoriesRes.data;
        setCategories(cats);
        if (listRes) {
          const r: RecurringPayment | undefined = listRes.data.items.find((x: RecurringPayment) => x.id === editId);
          if (!r) {
            setError('Ta stała płatność została już usunięta.');
          } else {
            setType(r.type);
            setName(r.name);
            setAmount(r.amount.toFixed(2).replace('.', ','));
            setCategory(r.category);
            setFrequency(r.frequency);
            setNextDate(atNoon(parseServerDate(r.next_date)));
            setIsSubscription(r.is_subscription);
            setActive(r.active);
          }
        } else {
          const first = cats.find((c) => (c.type || 'expense') === 'expense');
          if (first) setCategory(first.name);
        }
      } catch (e) {
        setError(apiErrorMessage(e, 'Nie udało się wczytać danych.'));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const changeType = (value: TxType) => {
    setType(value);
    const list = categories.filter((c) => (c.type || 'expense') === value);
    const pick = value === 'income' ? list.find((c) => c.name === 'Wypłata') || list[0] : list[0];
    setCategory(pick ? pick.name : '');
    if (value === 'income') setIsSubscription(false);
  };

  const save = async () => {
    setError(null);
    const value = parseAmount(amount);
    if (!name.trim()) {
      setError('Wpisz nazwę, np. Netflix albo czynsz.');
      return;
    }
    if (!Number.isFinite(value) || value <= 0) {
      setError('Wpisz kwotę, np. 49 albo 1800.');
      return;
    }
    if (!category) {
      setError('Wybierz kategorię.');
      return;
    }
    const payload = {
      name: name.trim(),
      amount: value,
      type,
      category,
      frequency,
      next_date: nextDate.toISOString(),
      is_subscription: type === 'expense' && isSubscription,
    };
    setSaving(true);
    try {
      if (editId) await api.put(`/recurring/${editId}`, { ...payload, active });
      else await api.post('/recurring', payload);
      router.back();
    } catch (e) {
      if (isProLimitError(e)) {
        promptPro('W wersji darmowej możesz mieć 3 stałe płatności. W CashFlo Pro dodasz ich bez limitu.', () => router.push('/pro/upgrade'));
      } else {
        setError(apiErrorMessage(e, 'Nie udało się zapisać. Spróbuj ponownie.'));
      }
    } finally {
      setSaving(false);
    }
  };

  const remove = () => {
    if (!editId) return;
    confirmAction(
      'Usunąć stałą płatność?',
      'Kolejne płatności nie będą już dodawane. Transakcje, które już są na liście, zostaną.',
      'Usuń',
      async () => {
        try {
          await api.delete(`/recurring/${editId}`);
          router.back();
        } catch (e) {
          setError(apiErrorMessage(e, 'Nie udało się usunąć.'));
        }
      }
    );
  };

  const onPickDate = (_event: any, picked?: Date) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (picked) setNextDate(atNoon(picked));
  };

  if (loading) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const today = atNoon(new Date());
  const tomorrow = addDays(today, 1);
  const inMonth = addMonths(today, 1);
  const dateMode = isSameDay(nextDate, today) ? 'today' : isSameDay(nextDate, tomorrow) ? 'tomorrow' : 'other';
  const value = parseAmount(amount);
  const yearly = Number.isFinite(value) ? (frequency === 'weekly' ? value * 52 : frequency === 'yearly' ? value : value * 12) : 0;

  return (
    <KeyboardAvoidingView style={[styles.screen, { paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xl }]} keyboardShouldPersistTaps="handled">
        <ScreenHeader
          title={editId ? 'Stała płatność' : 'Nowa stała płatność'}
          icon="close"
          onBack={() => router.back()}
          right={
            editId ? (
              <TouchableOpacity onPress={remove} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Usuń">
                <Ionicons name="trash-outline" size={22} color={colors.error} />
              </TouchableOpacity>
            ) : undefined
          }
        />

        <SegmentedControl<TxType>
          value={type}
          onChange={changeType}
          options={[
            { value: 'expense', label: 'Wydatek', color: colors.expense },
            { value: 'income', label: 'Przychód', color: colors.income },
          ]}
        />

        <Text style={styles.label}>Nazwa</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder={type === 'income' ? 'np. pensja' : 'np. Netflix, czynsz, telefon'}
          placeholderTextColor={colors.textLight}
          maxLength={60}
        />

        <Text style={styles.label}>Kwota</Text>
        <View style={styles.amountBox}>
          <TextInput
            style={[styles.amountInput, tabular]}
            value={amount}
            onChangeText={(t) => setAmount(sanitizeAmountInput(t))}
            placeholder="0,00"
            placeholderTextColor={colors.textLight}
            keyboardType="decimal-pad"
          />
          <Text style={styles.currency}>zł</Text>
        </View>

        <Text style={styles.label}>Jak często</Text>
        <SegmentedControl<Frequency>
          value={frequency}
          onChange={setFrequency}
          options={[
            { value: 'weekly', label: 'Co tydzień' },
            { value: 'monthly', label: 'Co miesiąc' },
            { value: 'yearly', label: 'Co rok' },
          ]}
        />
        {yearly > 0 && type === 'expense' ? (
          <Text style={[styles.hint, tabular]}>To {formatCurrency(yearly, { hideZeroDecimals: true })} w ciągu roku.</Text>
        ) : null}

        <Text style={styles.label}>Najbliższa płatność</Text>
        <View style={styles.chips}>
          <Chip label="Dziś" selected={dateMode === 'today'} onPress={() => setNextDate(today)} />
          <Chip label="Jutro" selected={dateMode === 'tomorrow'} onPress={() => setNextDate(tomorrow)} />
          {Platform.OS !== 'web' ? (
            <Chip
              label={dateMode === 'other' ? format(nextDate, 'd MMMM yyyy', { locale: pl }) : 'Inny dzień'}
              icon="calendar-outline"
              selected={dateMode === 'other'}
              onPress={() => setShowDatePicker(true)}
            />
          ) : (
            <Chip label="Za miesiąc" selected={isSameDay(nextDate, inMonth)} onPress={() => setNextDate(inMonth)} />
          )}
        </View>
        <Text style={styles.hint}>
          {dateMode === 'today' ? 'Dzisiejsza płatność od razu trafi do wydatków.' : 'W tym dniu płatność sama doda się do wydatków.'}
        </Text>
        {showDatePicker && Platform.OS === 'android' ? (
          <DateTimePicker value={nextDate} mode="date" minimumDate={today} onChange={onPickDate} />
        ) : null}

        <Text style={styles.label}>Kategoria</Text>
        <View style={styles.chips}>
          {category && !filtered.some((c) => c.name === category) ? <Chip label={category} selected onPress={() => {}} /> : null}
          {filtered.map((c) => (
            <Chip key={c.id} label={c.name} icon={c.icon as any} color={c.color} selected={category === c.name} onPress={() => setCategory(c.name)} />
          ))}
        </View>

        {type === 'expense' ? (
          <View style={styles.optionCard}>
            <Ionicons name="play-circle-outline" size={22} color={colors.primary} />
            <View style={styles.optionText}>
              <Text style={styles.optionTitle}>To subskrypcja</Text>
              <Text style={styles.optionSubtitle}>Np. Netflix, Spotify, siłownia. Pokażemy, ile kosztują razem.</Text>
            </View>
            <Switch value={isSubscription} onValueChange={setIsSubscription} trackColor={{ false: colors.border, true: colors.primary }} thumbColor="#FFFFFF" />
          </View>
        ) : null}

        {editId ? (
          <View style={styles.optionCard}>
            <Ionicons name="pause-circle-outline" size={22} color={colors.primary} />
            <View style={styles.optionText}>
              <Text style={styles.optionTitle}>Aktywna</Text>
              <Text style={styles.optionSubtitle}>Wyłącz, aby wstrzymać dodawanie płatności.</Text>
            </View>
            <Switch value={active} onValueChange={setActive} trackColor={{ false: colors.border, true: colors.primary }} thumbColor="#FFFFFF" />
          </View>
        ) : null}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <Button title={editId ? 'Zapisz zmiany' : 'Dodaj stałą płatność'} onPress={save} loading={saving} style={{ marginTop: space.xl }} />
      </ScrollView>

      {Platform.OS === 'ios' ? (
        <Modal visible={showDatePicker} transparent animationType="slide" onRequestClose={() => setShowDatePicker(false)}>
          <View style={styles.overlay}>
            <View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }]}>
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>Najbliższa płatność</Text>
                <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                  <Text style={styles.sheetDone}>Gotowe</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker value={nextDate} mode="date" display="inline" minimumDate={today} onChange={onPickDate} locale="pl-PL" />
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
    center: { alignItems: 'center', justifyContent: 'center' },
    content: { paddingHorizontal: space.lg },
    label: { fontSize: 14, fontWeight: '700', color: colors.textSecondary, marginTop: space.lg, marginBottom: space.sm },
    input: {
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
    amountInput: { flex: 1, fontSize: 26, fontWeight: '800', color: colors.text, paddingVertical: 10 },
    currency: { fontSize: 20, fontWeight: '700', color: colors.textSecondary },
    chips: { flexDirection: 'row', flexWrap: 'wrap' },
    hint: { fontSize: 13, color: colors.textSecondary, marginTop: space.sm, lineHeight: 18 },
    optionCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: space.lg,
      marginTop: space.lg,
    },
    optionText: { flex: 1, marginHorizontal: space.md },
    optionTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
    optionSubtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
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
