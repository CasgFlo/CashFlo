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
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';
import * as ImagePicker from 'expo-image-picker';
import api from '../../utils/api';
import { Category } from '../../utils/types';

export default function AddTransactionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [loading, setLoading] = useState(false);
  const [loadingCategories, setLoadingCategories] = useState(true);
  
  // Form fields
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringDay, setRecurringDay] = useState<number | null>(null);
  const [showDayPicker, setShowDayPicker] = useState(false);
  const [receiptImage, setReceiptImage] = useState<string | null>(null);
  
  // Categories
  const [categories, setCategories] = useState<Category[]>([]);

  const styles = createStyles(colors);

  // Filter categories based on transaction type
  const filteredCategories = useMemo(() => {
    return categories.filter(cat => {
      const catType = (cat as any).type || 'expense';
      return catType === type;
    }).sort((a, b) => {
      // Put "Wypłata" first for income
      if (type === 'income') {
        if (a.name === 'Wypłata') return -1;
        if (b.name === 'Wypłata') return 1;
      }
      return 0;
    });
  }, [categories, type]);

  useEffect(() => {
    loadCategories();
  }, []);

  // Update selected category when type changes
  useEffect(() => {
    if (filteredCategories.length > 0) {
      setCategory(filteredCategories[0].name);
    }
  }, [type, filteredCategories]);

  const loadCategories = async () => {
    try {
      const response = await api.get('/categories');
      setCategories(response.data);
      // Set default category for expense
      const expenseCategories = response.data.filter((c: any) => (c.type || 'expense') === 'expense');
      if (expenseCategories.length > 0) {
        setCategory(expenseCategories[0].name);
      }
    } catch (error) {
      console.error('Error loading categories:', error);
      Alert.alert('Błąd', 'Nie udało się załadować kategorii');
    } finally {
      setLoadingCategories(false);
    }
  };

  const pickImage = async () => {
    // Request permission
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Brak uprawnień', 'Potrzebujemy dostępu do galerii');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      setReceiptImage(`data:image/jpeg;base64,${result.assets[0].base64}`);
    }
  };

  const takePhoto = async () => {
    // Request permission
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Brak uprawnień', 'Potrzebujemy dostępu do kamery');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      setReceiptImage(`data:image/jpeg;base64,${result.assets[0].base64}`);
    }
  };

  const handleImageOptions = () => {
    Alert.alert(
      'Dodaj paragon',
      'Wybierz źródło',
      [
        { text: 'Aparat', onPress: takePhoto },
        { text: 'Galeria', onPress: pickImage },
        { text: 'Anuluj', style: 'cancel' },
      ]
    );
  };

  const handleRecurringToggle = (value: boolean) => {
    setIsRecurring(value);
    if (value) {
      // Open day picker when enabled
      setShowDayPicker(true);
    } else {
      // Reset day when disabled
      setRecurringDay(null);
    }
  };

  const handleSubmit = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      Alert.alert('Błąd', 'Wprowadź poprawną kwotę');
      return;
    }

    if (!category) {
      Alert.alert('Błąd', 'Wybierz kategorię');
      return;
    }

    if (isRecurring && !recurringDay) {
      Alert.alert('Błąd', 'Wybierz dzień miesiąca dla cyklicznej transakcji');
      setShowDayPicker(true);
      return;
    }

    setLoading(true);
    try {
      await api.post('/transactions', {
        amount: parseFloat(amount),
        type,
        category,
        description,
        date: new Date().toISOString(),
        is_recurring: isRecurring,
        recurring_day: isRecurring ? recurringDay : null,
        receipt_image: receiptImage,
      });

      // Success - close screen and show message
      router.back();
      setTimeout(() => {
        Alert.alert('✅ Sukces', 'Transakcja została dodana!');
      }, 300);
    } catch (error: any) {
      console.error('Error creating transaction:', error);
      Alert.alert('Błąd', 'Nie udało się dodać transakcji');
    } finally {
      setLoading(false);
    }
  };

  if (loadingCategories) {
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
      <ScrollView
        contentContainerStyle={[styles.contentContainer, { paddingBottom: insets.bottom + 20 }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="close" size={28} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Nowa transakcja</Text>
          <View style={{ width: 44 }} />
        </View>

        {/* Type Toggle */}
        <View style={styles.typeToggle}>
          <TouchableOpacity
            style={[
              styles.typeButton,
              type === 'expense' && styles.typeButtonActiveExpense,
              { borderTopLeftRadius: 12, borderBottomLeftRadius: 12 },
            ]}
            onPress={() => setType('expense')}
          >
            <Ionicons
              name="arrow-up"
              size={20}
              color={type === 'expense' ? '#fff' : colors.textSecondary}
            />
            <Text
              style={[
                styles.typeButtonText,
                type === 'expense' && styles.typeButtonTextActive,
              ]}
            >
              Wydatek
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.typeButton,
              type === 'income' && styles.typeButtonActiveIncome,
              { borderTopRightRadius: 12, borderBottomRightRadius: 12 },
            ]}
            onPress={() => setType('income')}
          >
            <Ionicons
              name="arrow-down"
              size={20}
              color={type === 'income' ? '#fff' : colors.textSecondary}
            />
            <Text
              style={[
                styles.typeButtonText,
                type === 'income' && styles.typeButtonTextActive,
              ]}
            >
              Przychód
            </Text>
          </TouchableOpacity>
        </View>

        {/* Amount Input */}
        <View style={styles.amountContainer}>
          <Text style={styles.label}>Kwota</Text>
          <View style={styles.amountInputContainer}>
            <TextInput
              style={styles.amountInput}
              placeholder="0.00"
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholderTextColor={colors.textLight}
            />
            <Text style={styles.currency}>zł</Text>
          </View>
        </View>

        {/* Category - filtered by type */}
        <View style={styles.section}>
          <Text style={styles.label}>Kategoria</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoriesScroll}>
            {filteredCategories.map((cat) => (
              <TouchableOpacity
                key={cat.id}
                style={[
                  styles.categoryChip,
                  category === cat.name && {
                    backgroundColor: cat.color,
                    borderColor: cat.color,
                  },
                ]}
                onPress={() => setCategory(cat.name)}
              >
                <Ionicons
                  name={cat.icon as any}
                  size={20}
                  color={category === cat.name ? '#fff' : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.categoryChipText,
                    category === cat.name && { color: '#fff' },
                  ]}
                >
                  {cat.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Description */}
        <View style={styles.section}>
          <Text style={styles.label}>Opis (opcjonalnie)</Text>
          <TextInput
            style={styles.textInput}
            placeholder="Dodaj opis transakcji"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
            placeholderTextColor={colors.textLight}
          />
        </View>

        {/* Recurring */}
        <View style={styles.section}>
          <View style={styles.switchRow}>
            <View style={styles.switchLeft}>
              <Ionicons name="repeat" size={24} color={colors.primary} />
              <View style={styles.switchTextContainer}>
                <Text style={styles.switchLabel}>Transakcja cykliczna</Text>
                <Text style={styles.switchSubtext}>Np. subskrypcja, abonament</Text>
              </View>
            </View>
            <Switch
              value={isRecurring}
              onValueChange={handleRecurringToggle}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#fff"
            />
          </View>
          {isRecurring && (
            <TouchableOpacity
              style={styles.recurringDayButton}
              onPress={() => setShowDayPicker(true)}
            >
              <Ionicons name="calendar-outline" size={20} color={colors.primary} />
              <Text style={styles.recurringDayText}>
                {recurringDay
                  ? `Pobierane ${recurringDay}. dnia każdego miesiąca`
                  : 'Wybierz dzień miesiąca'}
              </Text>
              <Ionicons name="chevron-forward" size={20} color={colors.textLight} />
            </TouchableOpacity>
          )}
        </View>

        {/* Receipt */}
        <View style={styles.section}>
          <Text style={styles.label}>Paragon</Text>
          {receiptImage ? (
            <View style={styles.receiptContainer}>
              <Image source={{ uri: receiptImage }} style={styles.receiptImage} />
              <TouchableOpacity
                style={styles.removeReceiptButton}
                onPress={() => setReceiptImage(null)}
              >
                <Ionicons name="close-circle" size={32} color={colors.error} />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.addReceiptButton} onPress={handleImageOptions}>
              <Ionicons name="camera-outline" size={32} color={colors.primary} />
              <Text style={styles.addReceiptText}>Dodaj zdjęcie paragonu</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.submitButton, loading && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitButtonText}>Dodaj transakcję</Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Day Picker Modal */}
      <Modal
        visible={showDayPicker}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setShowDayPicker(false);
          if (!recurringDay) setIsRecurring(false);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Dzień miesiąca</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowDayPicker(false);
                  if (!recurringDay) setIsRecurring(false);
                }}
                hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
              >
                <Ionicons name="close" size={28} color={colors.text} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>
              Wybierz dzień, w którym aplikacja ma automatycznie pobierać tę transakcję
            </Text>
            <ScrollView contentContainerStyle={styles.daysGrid}>
              {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                <TouchableOpacity
                  key={day}
                  style={[
                    styles.dayChip,
                    recurringDay === day && styles.dayChipSelected,
                  ]}
                  onPress={() => {
                    setRecurringDay(day);
                    setShowDayPicker(false);
                  }}
                >
                  <Text
                    style={[
                      styles.dayChipText,
                      recurringDay === day && styles.dayChipTextSelected,
                    ]}
                  >
                    {day}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <Text style={styles.modalHint}>
              💡 Jeśli wybierzesz 29, 30 lub 31, a miesiąc ma mniej dni, transakcja zostanie pobrana ostatniego dnia miesiąca.
            </Text>
          </View>
        </View>
      </Modal>
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
  typeToggle: {
    flexDirection: 'row',
    marginBottom: 24,
  },
  typeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  typeButtonActiveExpense: {
    backgroundColor: colors.expense,
    borderColor: colors.expense,
  },
  typeButtonActiveIncome: {
    backgroundColor: colors.income,
    borderColor: colors.income,
  },
  typeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
    marginLeft: 8,
  },
  typeButtonTextActive: {
    color: '#fff',
  },
  amountContainer: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  amountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  amountInput: {
    flex: 1,
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.text,
    paddingVertical: 16,
  },
  currency: {
    fontSize: 24,
    fontWeight: '600',
    color: colors.textSecondary,
    marginLeft: 8,
  },
  section: {
    marginBottom: 24,
  },
  categoriesScroll: {
    marginHorizontal: -16,
    paddingHorizontal: 16,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
  },
  categoryChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginLeft: 6,
  },
  textInput: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    textAlignVertical: 'top',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    padding: 16,
    borderRadius: 12,
  },
  switchLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  switchTextContainer: {
    marginLeft: 12,
    flex: 1,
  },
  switchLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  switchSubtext: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  receiptContainer: {
    position: 'relative',
  },
  receiptImage: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    backgroundColor: colors.border,
  },
  removeReceiptButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: colors.surface,
    borderRadius: 16,
  },
  addReceiptButton: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  addReceiptText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
    marginTop: 8,
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
  recurringDayButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary + '12',
    padding: 14,
    borderRadius: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.primary + '30',
  },
  recurringDayText: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
    marginLeft: 10,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
  },
  modalSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 16,
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingBottom: 8,
  },
  dayChip: {
    width: '13.5%',
    aspectRatio: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dayChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  dayChipText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  dayChipTextSelected: {
    color: '#fff',
  },
  modalHint: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 12,
    lineHeight: 18,
    paddingHorizontal: 4,
  },
});
