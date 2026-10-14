import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, ThemeColors } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../utils/api';
import { Category, FREE_CUSTOM_CATEGORY_LIMIT } from '../../utils/types';
import { apiErrorMessage } from '../../utils/format';
import { confirmAction, showMessage } from '../../utils/confirm';
import { CATEGORY_ICON_CHOICES, CATEGORY_COLOR_CHOICES } from '../../utils/categories';
import { ScreenHeader, SegmentedControl, Card, Button, IconBubble, space, radius } from '../../components/ui';

type CatType = 'expense' | 'income';

export default function ManageCategoriesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { user } = useAuth();
  const styles = createStyles(colors);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tab, setTab] = useState<CatType>('expense');

  // New category form
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState(CATEGORY_ICON_CHOICES[0]);
  const [color, setColor] = useState(CATEGORY_COLOR_CHOICES[0]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      const response = await api.get('/categories');
      setCategories(response.data);
    } catch (error) {
      showMessage('Błąd', 'Nie udało się wczytać kategorii.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const customCount = categories.filter((c) => !c.is_default).length;
  const atLimit = !user?.is_pro && customCount >= FREE_CUSTOM_CATEGORY_LIMIT;
  const visible = categories.filter((c) => (c.type || 'expense') === tab);

  const openForm = () => {
    if (atLimit) {
      router.push('/pro/upgrade');
      return;
    }
    setName('');
    setIcon(tab === 'income' ? 'cash' : CATEGORY_ICON_CHOICES[0]);
    setColor(CATEGORY_COLOR_CHOICES[0]);
    setFormError(null);
    setFormOpen(true);
  };

  const saveCategory = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setFormError('Wpisz nazwę kategorii.');
      return;
    }
    setSaving(true);
    try {
      const response = await api.post('/categories', { name: trimmed, icon, color, type: tab });
      setCategories((current) => [...current, response.data]);
      setFormOpen(false);
    } catch (error) {
      setFormError(apiErrorMessage(error, 'Nie udało się dodać kategorii.'));
    } finally {
      setSaving(false);
    }
  };

  const deleteCategory = (category: Category) => {
    confirmAction(
      'Usuń kategorię',
      `Usunąć „${category.name}”? Wcześniejsze transakcje zachowają tę nazwę.`,
      'Usuń',
      async () => {
        try {
          await api.delete(`/categories/${category.id}`);
          setCategories((current) => current.filter((c) => c.id !== category.id));
        } catch (error) {
          showMessage('Błąd', apiErrorMessage(error, 'Nie udało się usunąć kategorii.'));
        }
      }
    );
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xl }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadCategories();
            }}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <ScreenHeader
          title="Kategorie"
          onBack={() => router.back()}
          right={
            <TouchableOpacity onPress={openForm} style={styles.addButton} accessibilityLabel="Dodaj kategorię">
              <Ionicons name="add" size={22} color={colors.onPrimary} />
            </TouchableOpacity>
          }
        />

        <SegmentedControl<CatType>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'expense', label: 'Wydatki' },
            { value: 'income', label: 'Przychody' },
          ]}
        />

        {!user?.is_pro ? (
          <TouchableOpacity activeOpacity={0.85} onPress={() => router.push('/pro/upgrade')}>
            <View style={styles.limitRow}>
              <Text style={styles.limitText}>
                Własne kategorie: {Math.min(customCount, FREE_CUSTOM_CATEGORY_LIMIT)} z {FREE_CUSTOM_CATEGORY_LIMIT} w wersji darmowej
              </Text>
              <Text style={styles.limitLink}>Pro: bez limitu</Text>
            </View>
          </TouchableOpacity>
        ) : null}

        {loading ? (
          <ActivityIndicator style={{ marginTop: space.xxl }} color={colors.primary} />
        ) : (
          <Card style={styles.listCard}>
            {visible.map((category, index) => (
              <View key={category.id} style={[styles.row, index > 0 && styles.rowDivider]}>
                <IconBubble name={category.icon as any} color={category.color} size={38} />
                <Text style={styles.rowName} numberOfLines={1}>{category.name}</Text>
                {category.is_default ? (
                  <Text style={styles.defaultTag}>domyślna</Text>
                ) : (
                  <TouchableOpacity
                    onPress={() => deleteCategory(category)}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    accessibilityLabel={`Usuń kategorię ${category.name}`}
                  >
                    <Ionicons name="trash-outline" size={20} color={colors.textLight} />
                  </TouchableOpacity>
                )}
              </View>
            ))}
            <TouchableOpacity style={[styles.row, styles.rowDivider]} onPress={openForm}>
              <View style={styles.addIcon}>
                <Ionicons name={atLimit ? 'star' : 'add'} size={18} color={atLimit ? colors.warning : colors.primary} />
              </View>
              <Text style={[styles.rowName, { color: colors.primary }]}>
                {atLimit ? 'Więcej kategorii w Pro' : 'Dodaj własną kategorię'}
              </Text>
            </TouchableOpacity>
          </Card>
        )}
      </ScrollView>

      {/* New category */}
      <Modal visible={formOpen} transparent animationType="slide" onRequestClose={() => setFormOpen(false)}>
        <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }]}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{tab === 'income' ? 'Nowa kategoria przychodu' : 'Nowa kategoria wydatku'}</Text>
              <TouchableOpacity onPress={() => setFormOpen(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityLabel="Zamknij">
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.previewRow}>
              <IconBubble name={icon as any} color={color} size={48} />
              <TextInput
                style={styles.nameInput}
                placeholder="Nazwa, np. Paliwo"
                value={name}
                onChangeText={(t) => {
                  setName(t);
                  setFormError(null);
                }}
                maxLength={30}
                autoFocus
                placeholderTextColor={colors.textLight}
              />
            </View>

            <Text style={styles.formLabel}>Ikona</Text>
            <View style={styles.iconGrid}>
              {CATEGORY_ICON_CHOICES.map((choice) => {
                const selected = choice === icon;
                return (
                  <TouchableOpacity
                    key={choice}
                    onPress={() => setIcon(choice)}
                    style={[styles.iconCell, selected && { borderColor: color, backgroundColor: color + '1F' }]}
                    accessibilityLabel={`Ikona ${choice}`}
                    accessibilityState={{ selected }}
                  >
                    <Ionicons name={choice as any} size={20} color={selected ? color : colors.textSecondary} />
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.formLabel}>Kolor</Text>
            <View style={styles.colorRow}>
              {CATEGORY_COLOR_CHOICES.map((choice) => (
                <TouchableOpacity
                  key={choice}
                  onPress={() => setColor(choice)}
                  style={[styles.colorDot, { backgroundColor: choice }, choice === color && styles.colorDotSelected]}
                  accessibilityLabel={`Kolor ${choice}`}
                  accessibilityState={{ selected: choice === color }}
                />
              ))}
            </View>

            {formError ? <Text style={styles.errorText}>{formError}</Text> : null}
            <Button title="Dodaj kategorię" onPress={saveCategory} loading={saving} style={{ marginTop: space.lg }} />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    content: { paddingHorizontal: space.lg },
    addButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    limitRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      marginTop: space.md,
      marginBottom: space.xs,
      paddingHorizontal: space.xs,
    },
    limitText: { fontSize: 13, color: colors.textSecondary },
    limitLink: { fontSize: 13, fontWeight: '700', color: colors.warning },
    listCard: { paddingVertical: space.xs, marginTop: space.md },
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.md },
    rowDivider: { borderTopWidth: 1, borderTopColor: colors.divider },
    rowName: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text, marginLeft: space.md },
    defaultTag: { fontSize: 12, color: colors.textLight },
    addIcon: {
      width: 38,
      height: 38,
      borderRadius: 19,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    overlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: colors.background,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      paddingHorizontal: space.lg,
      paddingTop: space.lg,
      maxHeight: '92%',
    },
    sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.lg },
    sheetTitle: { fontSize: 18, fontWeight: '800', color: colors.text, flex: 1, marginRight: space.md },
    previewRow: { flexDirection: 'row', alignItems: 'center' },
    nameInput: {
      flex: 1,
      marginLeft: space.md,
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: space.lg,
      paddingVertical: 14,
      fontSize: 16,
      color: colors.text,
    },
    formLabel: { fontSize: 13, fontWeight: '700', color: colors.textSecondary, marginTop: space.lg, marginBottom: space.sm },
    iconGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
    iconCell: {
      width: '11.5%',
      aspectRatio: 1,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: space.sm,
    },
    colorRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
    colorDot: { width: 30, height: 30, borderRadius: 15, marginBottom: space.sm },
    colorDotSelected: { borderWidth: 3, borderColor: colors.text },
    errorText: { color: colors.error, fontSize: 14, marginTop: space.md },
  });
