import React, { useState, useEffect, useMemo } from 'react';
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
  Switch,
  Image,
  Modal,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { isToday, isYesterday, subDays, format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { useTheme, ThemeColors } from '../../contexts/ThemeContext';
import api from '../../utils/api';
import { Category, Transaction } from '../../utils/types';
import { parseAmount, sanitizeAmountInput, apiErrorMessage, parseServerDate } from '../../utils/format';
import { confirmAction, showMessage } from '../../utils/confirm';
import { ScreenHeader, SegmentedControl, Chip, Button, space, radius, tabular } from '../../components/ui';

type TxType = 'expense' | 'income';
const MAX_RECEIPT_CHARS = 2_400_000; // the server accepts up to 2.5 MB

/** A picked day stored at noon local time, so time zones never move it to another day. */
const atNoon = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0);

export default function AddTransactionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const editId = typeof params.id === 'string' && params.id ? params.id : null;
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = createStyles(colors);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [amount, setAmount] = useState('');
  const [type, setType] = useState<TxType>('expense');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringDay, setRecurringDay] = useState<number | null>(null);
  const [showDayPicker, setShowDayPicker] = useState(false);
  const [receiptImage, setReceiptImage] = useState<string | null>(null);
  const [receiptChanged, setReceiptChanged] = useState(false);
  const [original, setOriginal] = useState<Transaction | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);

  const filteredCategories = useMemo(() => {
    const list = categories.filter((c) => (c.type || 'expense') === type);
    // Put "Wypłata" first for income
    if (type === 'income') list.sort((a, b) => (a.name === 'Wypłata' ? -1 : b.name === 'Wypłata' ? 1 : 0));
    return list;
  }, [categories, type]);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    try {
      const [categoriesRes, txRes] = await Promise.all([
        api.get('/categories'),
        editId ? api.get(`/transactions/${editId}`) : Promise.resolve(null),
      ]);
      const cats: Category[] = categoriesRes.data;
      setCategories(cats);

      if (txRes) {
        const t: Transaction = txRes.data;
        setOriginal(t);
        setType(t.type);
        setAmount(t.amount.toFixed(2).replace('.', ','));
        setCategory(t.category);
        setDescription(t.description || '');
        setDate(parseServerDate(t.date));
        setReceiptImage(t.receipt_image || null);
      } else {
        const firstExpense = cats.find((c) => (c.type || 'expense') === 'expense');
        if (firstExpense) setCategory(firstExpense.name);
      }
    } catch (e) {
      setError(apiErrorMessage(e, editId ? 'Nie udało się wczytać transakcji.' : 'Nie udało się wczytać kategorii.'));
    } finally {
      setLoading(false);
    }
  };

  const changeType = (value: TxType) => {
    setType(value);
    const first = categories.filter((c) => (c.type || 'expense') === value);
    const pick = value === 'income' ? first.find((c) => c.name === 'Wypłata') || first[0] : first[0];
    setCategory(pick ? pick.name : '');
  };

  // ----- receipt -----
  const applyPickedImage = (result: ImagePicker.ImagePickerResult) => {
    if (result.canceled || !result.assets[0]?.base64) return;
    const dataUrl = `data:image/jpeg;base64,${result.assets[0].base64}`;
    if (dataUrl.length > MAX_RECEIPT_CHARS) {
      showMessage('Zdjęcie jest za duże', 'Przytnij zdjęcie do samego paragonu i spróbuj ponownie.');
      return;
    }
    setReceiptImage(dataUrl);
    setReceiptChanged(true);
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showMessage('Brak dostępu', 'Pozwól aplikacji na dostęp do zdjęć w ustawieniach telefonu.');
      return;
    }
    applyPickedImage(
      await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.4, base64: true })
    );
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      showMessage('Brak dostępu', 'Pozwól aplikacji na dostęp do aparatu w ustawieniach telefonu.');
      return;
    }
    applyPickedImage(await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.4, base64: true }));
  };

  const addReceipt = () => {
    if (Platform.OS === 'web') {
      pickImage();
      return;
    }
    Alert.alert('Dodaj paragon', undefined, [
      { text: 'Zrób zdjęcie', onPress: takePhoto },
      { text: 'Wybierz z galerii', onPress: pickImage },
      { text: 'Anuluj', style: 'cancel' },
    ]);
  };

  const removeReceipt = () => {
    setReceiptImage(null);
    setReceiptChanged(true);
  };

  // ----- recurring -----
  const handleRecurringToggle = (value: boolean) => {
    setIsRecurring(value);
    if (value) setShowDayPicker(true);
    else setRecurringDay(null);
  };

  // ----- save / delete -----
  const handleSubmit = async () => {
    setError(null);
    const value = parseAmount(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError('Wpisz kwotę, np. 25 albo 12,50.');
      return;
    }
    if (!category) {
      setError('Wybierz kategorię.');
      return;
    }
    if (isRecurring && !recurringDay) {
      setShowDayPicker(true);
      return;
    }

    setSaving(true);
    try {
      if (editId) {
        const payload: Record<string, any> = {
          amount: value,
          type,
          category,
          description: description.trim(),
          date: date.toISOString(),
        };
        if (receiptChanged) {
          if (receiptImage) payload.receipt_image = receiptImage;
          else payload.remove_receipt = true;
        }
        await api.put(`/transactions/${editId}`, payload);
      } else {
        await api.post('/transactions', {
          amount: value,
          type,
          category,
          description: description.trim(),
          date: date.toISOString(),
          is_recurring: isRecurring,
          recurring_day: isRecurring ? recurringDay : null,
          receipt_image: receiptImage,
        });
      }
      router.back();
    } catch (e) {
      setError(apiErrorMessage(e, 'Nie udało się zapisać transakcji. Spróbuj ponownie.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!editId) return;
    const extra = original?.is_recurring
      ? ' To transakcja cykliczna: kolejne nie będą już dodawane, a wcześniejsze zostaną.'
      : '';
    confirmAction('Usuń transakcję', `Tego nie da się cofnąć.${extra}`, 'Usuń', async () => {
      setDeleting(true);
      try {
        await api.delete(`/transactions/${editId}`);
        router.back();
      } catch (e) {
        setError(apiErrorMessage(e, 'Nie udało się usunąć transakcji.'));
        setDeleting(false);
      }
    });
  };

  // ----- date -----
  const yesterday = subDays(new Date(), 1);
  const dateMode = isToday(date) ? 'today' : isYesterday(date) ? 'yesterday' : 'other';
  const onPickDate = (_event: any, picked?: Date) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (picked) setDate(isToday(picked) ? new Date() : atNoon(picked));
  };

  if (loading) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const typeColor = type === 'income' ? colors.income : colors.expense;
  const categoryMissing = !!category && !filteredCategories.some((c) => c.name === category);

  return (
    <KeyboardAvoidingView style={[styles.screen, { paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xl }]} keyboardShouldPersistTaps="handled">
        <ScreenHeader
          title={editId ? 'Edytuj transakcję' : 'Nowa transakcja'}
          icon="close"
          onBack={() => router.back()}
          right={
            editId ? (
              <TouchableOpacity onPress={handleDelete} disabled={deleting} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Usuń transakcję">
                {deleting ? <ActivityIndicator color={colors.error} /> : <Ionicons name="trash-outline" size={22} color={colors.error} />}
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

        {/* Amount */}
        <View style={styles.amountBox}>
          <Text style={[styles.amountSign, { color: typeColor }]}>{type === 'income' ? '+' : '−'}</Text>
          <TextInput
            style={[styles.amountInput, tabular, { color: colors.text }]}
            placeholder="0,00"
            value={amount}
            onChangeText={(t) => {
              setAmount(sanitizeAmountInput(t));
              setError(null);
            }}
            keyboardType="decimal-pad"
            autoFocus={!editId}
            placeholderTextColor={colors.textLight}
            accessibilityLabel="Kwota"
          />
          <Text style={styles.amountCurrency}>zł</Text>
        </View>

        {/* Category */}
        <View style={styles.labelRow}>
          <Text style={styles.label}>Kategoria</Text>
          <TouchableOpacity onPress={() => router.push('/categories/manage')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={styles.labelAction}>Zarządzaj</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.chips}>
          {categoryMissing ? <Chip label={category} selected onPress={() => {}} /> : null}
          {filteredCategories.map((c) => (
            <Chip
              key={c.id}
              label={c.name}
              icon={c.icon as any}
              color={c.color}
              selected={category === c.name}
              onPress={() => setCategory(c.name)}
            />
          ))}
        </View>

        {/* Date */}
        <Text style={styles.label}>Data</Text>
        <View style={styles.chips}>
          <Chip label="Dziś" selected={dateMode === 'today'} onPress={() => setDate(new Date())} />
          <Chip label="Wczoraj" selected={dateMode === 'yesterday'} onPress={() => setDate(atNoon(yesterday))} />
          {Platform.OS !== 'web' ? (
            <Chip
              label={dateMode === 'other' ? format(date, 'd MMMM yyyy', { locale: pl }) : 'Inny dzień'}
              icon="calendar-outline"
              selected={dateMode === 'other'}
              onPress={() => setShowDatePicker(true)}
            />
          ) : null}
        </View>
        {showDatePicker && Platform.OS === 'android' ? (
          <DateTimePicker value={date} mode="date" maximumDate={new Date()} onChange={onPickDate} />
        ) : null}

        {/* Description */}
        <Text style={styles.label}>Opis (opcjonalnie)</Text>
        <TextInput
          style={styles.textInput}
          placeholder={type === 'income' ? 'np. pensja za październik' : 'np. zakupy w Lidlu'}
          value={description}
          onChangeText={setDescription}
          maxLength={500}
          placeholderTextColor={colors.textLight}
        />

        {/* Recurring (only when adding) */}
        {!editId ? (
          <View style={styles.optionCard}>
            <View style={styles.optionRow}>
              <Ionicons name="repeat" size={22} color={colors.primary} />
              <View style={styles.optionText}>
                <Text style={styles.optionTitle}>Powtarzaj co miesiąc</Text>
                <Text style={styles.optionSubtitle}>Np. czynsz, abonament, pensja</Text>
              </View>
              <Switch
                value={isRecurring}
                onValueChange={handleRecurringToggle}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#FFFFFF"
              />
            </View>
            {isRecurring ? (
              <TouchableOpacity style={styles.dayButton} onPress={() => setShowDayPicker(true)}>
                <Ionicons name="calendar-outline" size={18} color={colors.primary} />
                <Text style={styles.dayButtonText}>
                  {recurringDay ? `Co miesiąc, ${recurringDay}. dnia` : 'Wybierz dzień miesiąca'}
                </Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
              </TouchableOpacity>
            ) : null}
          </View>
        ) : original?.is_recurring || original?.recurring_parent_id ? (
          <View style={[styles.optionCard, styles.optionRow]}>
            <Ionicons name="repeat" size={20} color={colors.textSecondary} />
            <Text style={[styles.optionSubtitle, { flex: 1, marginLeft: space.md }]}>
              Transakcja cykliczna. Zmiany dotyczą tylko tego wpisu.
            </Text>
          </View>
        ) : null}

        {/* Receipt */}
        <Text style={styles.label}>Paragon</Text>
        {receiptImage ? (
          <View>
            <Image source={{ uri: receiptImage }} style={styles.receiptImage} resizeMode="cover" accessibilityLabel="Zdjęcie paragonu" />
            <TouchableOpacity style={styles.removeReceipt} onPress={removeReceipt} accessibilityLabel="Usuń zdjęcie paragonu">
              <Ionicons name="close" size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.addReceipt} onPress={addReceipt}>
            <Ionicons name="camera-outline" size={22} color={colors.primary} />
            <Text style={styles.addReceiptText}>Dodaj zdjęcie paragonu</Text>
          </TouchableOpacity>
        )}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Button
          title={editId ? 'Zapisz zmiany' : type === 'income' ? 'Dodaj przychód' : 'Dodaj wydatek'}
          onPress={handleSubmit}
          loading={saving}
          style={{ marginTop: space.xl }}
        />
      </ScrollView>

      {/* iOS date picker */}
      {Platform.OS === 'ios' ? (
        <Modal visible={showDatePicker} transparent animationType="slide" onRequestClose={() => setShowDatePicker(false)}>
          <View style={styles.overlay}>
            <View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }]}>
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>Wybierz dzień</Text>
                <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                  <Text style={styles.sheetDone}>Gotowe</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker value={date} mode="date" display="inline" maximumDate={new Date()} onChange={onPickDate} locale="pl-PL" />
            </View>
          </View>
        </Modal>
      ) : null}

      {/* Day of month for recurring transactions */}
      <Modal
        visible={showDayPicker}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setShowDayPicker(false);
          if (!recurringDay) setIsRecurring(false);
        }}
      >
        <View style={styles.overlay}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }]}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Którego dnia miesiąca?</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowDayPicker(false);
                  if (!recurringDay) setIsRecurring(false);
                }}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityLabel="Zamknij"
              >
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <View style={styles.daysGrid}>
              {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => {
                const selected = recurringDay === day;
                return (
                  <TouchableOpacity
                    key={day}
                    style={[styles.dayChip, selected && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                    onPress={() => {
                      setRecurringDay(day);
                      setShowDayPicker(false);
                    }}
                  >
                    <Text style={[styles.dayChipText, selected && { color: colors.onPrimary }]}>{day}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.hint}>
              Gdy miesiąc jest krótszy (np. 31. dnia w kwietniu), transakcja doda się ostatniego dnia miesiąca.
            </Text>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    center: { alignItems: 'center', justifyContent: 'center' },
    content: { paddingHorizontal: space.lg },
    amountBox: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: space.xl,
    },
    amountSign: { fontSize: 34, fontWeight: '700', marginRight: 4 },
    amountInput: { fontSize: 46, fontWeight: '800', minWidth: 120, textAlign: 'center', paddingVertical: 0 },
    amountCurrency: { fontSize: 24, fontWeight: '700', color: colors.textSecondary, marginLeft: 6 },
    labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    label: { fontSize: 14, fontWeight: '700', color: colors.textSecondary, marginTop: space.lg, marginBottom: space.sm },
    labelAction: { fontSize: 14, fontWeight: '600', color: colors.primary, marginTop: space.lg, marginBottom: space.sm },
    chips: { flexDirection: 'row', flexWrap: 'wrap' },
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
    optionCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: space.lg,
      marginTop: space.lg,
    },
    optionRow: { flexDirection: 'row', alignItems: 'center' },
    optionText: { flex: 1, marginHorizontal: space.md },
    optionTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
    optionSubtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
    dayButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.primarySoft,
      borderRadius: radius.sm,
      padding: space.md,
      marginTop: space.md,
    },
    dayButtonText: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text, marginLeft: space.sm },
    receiptImage: { width: '100%', height: 200, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
    removeReceipt: {
      position: 'absolute',
      top: space.sm,
      right: space.sm,
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: 'rgba(0,0,0,0.55)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    addReceipt: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 56,
      borderRadius: radius.md,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    addReceiptText: { fontSize: 15, fontWeight: '600', color: colors.primary, marginLeft: space.sm },
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
    daysGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
    dayChip: {
      width: '13%',
      aspectRatio: 1,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: space.sm,
    },
    dayChipText: { fontSize: 15, fontWeight: '600', color: colors.text },
    hint: { fontSize: 12, color: colors.textSecondary, lineHeight: 18, marginTop: space.sm },
  });
