import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { format, isSameYear } from 'date-fns';
import { pl } from 'date-fns/locale';
import { useTheme, ThemeColors } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import api, { uploadFile } from '../../utils/api';
import { Category, ImportHistoryItem, ImportPreview, ImportRow } from '../../utils/types';
import { apiErrorMessage, formatCurrency, formatSignedCurrency, isProLimitError, parseDay, parseServerDate } from '../../utils/format';
import { confirmAction } from '../../utils/confirm';
import { promptPro } from '../../utils/pro';
import { ScreenHeader, Card, Button, Chip, SegmentedControl, Sheet, IconBubble, tabular, space, radius } from '../../components/ui';

type Step = 'start' | 'loading' | 'preview' | 'columns' | 'saving' | 'done';
type TxType = 'expense' | 'income';
type RowChange = { category?: string; type?: TxType };

interface History {
  imports: ImportHistoryItem[];
  imports_used: number;
  limit: number | null;
  can_import: boolean;
}

const MAX_FILE_BYTES = 5 * 1024 * 1024;

const dayLabel = (iso: string) => {
  const d = parseDay(iso);
  return format(d, isSameYear(d, new Date()) ? 'd MMM' : 'd MMM yyyy', { locale: pl });
};

const transactionsWord = (n: number) => {
  const last = n % 10;
  const lastTwo = n % 100;
  if (n === 1) return 'transakcję';
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return 'transakcje';
  return 'transakcji';
};

export default function ImportScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { user } = useAuth();
  const styles = createStyles(colors);

  const [step, setStep] = useState<Step>('start');
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<History | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [changes, setChanges] = useState<Record<number, RowChange>>({});
  const [editing, setEditing] = useState<ImportRow | null>(null);
  const [editType, setEditType] = useState<TxType>('expense');
  const [applyToSimilar, setApplyToSimilar] = useState(true);
  const [imported, setImported] = useState(0);
  const [showHelp, setShowHelp] = useState(false);

  // Manual column choice
  const [mapDate, setMapDate] = useState<number | null>(null);
  const [mapAmount, setMapAmount] = useState<number | null>(null);
  const [mapDescription, setMapDescription] = useState<number | null>(null);
  const [firstRowHeader, setFirstRowHeader] = useState(true);

  const openPro = () => router.push('/pro/upgrade');

  const loadHistory = async () => {
    try {
      const [historyRes, categoriesRes] = await Promise.all([api.get('/import/history'), api.get('/categories')]);
      setHistory(historyRes.data);
      setCategories(categoriesRes.data);
    } catch {
      // The screen works without the history
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  // ---------------------------------------------------------------- file
  const applyPreview = (data: ImportPreview) => {
    setPreview(data);
    // Rows that look like something typed in by hand start unticked
    setExcluded(new Set(data.rows.filter((r) => r.duplicate === 'possible').map((r) => r.i)));
    setChanges({});
    setMapDate(data.mapping.date);
    setMapAmount(data.mapping.amount ?? data.mapping.debit ?? data.mapping.credit ?? null);
    setMapDescription(data.mapping.description[0] ?? null);
    setFirstRowHeader(data.header_found);
    setStep(data.rows.length > 0 ? 'preview' : 'columns');
  };

  const pickFile = async () => {
    setError(null);
    let picked: DocumentPicker.DocumentPickerResult;
    try {
      picked = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
    } catch {
      setError('Nie udało się otworzyć plików na telefonie.');
      return;
    }
    if (picked.canceled || !picked.assets?.length) return;
    const asset = picked.assets[0];
    if (asset.size && asset.size > MAX_FILE_BYTES) {
      setError('Plik jest za duży (najwyżej 5 MB). Pobierz z banku krótszy okres.');
      return;
    }
    const name = asset.name || 'wyciag.csv';
    if (/\.pdf$/i.test(name)) {
      setError('Wyciągu w PDF nie da się zaimportować. Pobierz z banku historię rachunku w formacie CSV albo Excel.');
      return;
    }

    const form = new FormData();
    const webFile = (asset as { file?: File }).file;
    if (Platform.OS === 'web' && webFile) {
      (form as any).append('file', webFile, name);
    } else {
      form.append('file', { uri: asset.uri, name, type: asset.mimeType || 'application/octet-stream' } as any);
    }

    setStep('loading');
    try {
      applyPreview(await uploadFile<ImportPreview>('/import/preview', form));
    } catch (e) {
      setError(apiErrorMessage(e, 'Nie udało się odczytać pliku. Spróbuj ponownie.'));
      setStep('start');
    }
  };

  const applyColumns = async () => {
    if (!preview) return;
    if (mapDate === null || mapAmount === null) {
      setError('Wskaż kolumnę z datą i kolumnę z kwotą.');
      return;
    }
    if (mapDate === mapAmount) {
      setError('Data i kwota muszą być w różnych kolumnach.');
      return;
    }
    setError(null);
    setStep('loading');
    try {
      const { data } = await api.post<ImportPreview>('/import/remap', {
        session_id: preview.session_id,
        mapping: {
          date: mapDate,
          amount: mapAmount,
          description: mapDescription !== null ? [mapDescription] : [],
          first_row_is_header: firstRowHeader,
        },
      });
      if (data.rows.length === 0) {
        setPreview(data);
        setStep('columns');
        setError('Z tymi kolumnami nie znaleźliśmy żadnej transakcji. Sprawdź wybór.');
        return;
      }
      applyPreview(data);
    } catch (e) {
      setError(apiErrorMessage(e, 'Nie udało się odczytać pliku z tymi kolumnami.'));
      setStep('columns');
    }
  };

  // ---------------------------------------------------------------- rows
  const rows = useMemo(
    () =>
      (preview?.rows || [])
        .filter((r) => r.duplicate !== 'exact')
        .map((r) => ({ ...r, category: changes[r.i]?.category ?? r.category, type: changes[r.i]?.type ?? r.type })),
    [preview, changes]
  );
  const chosen = rows.filter((r) => !excluded.has(r.i));
  const chosenExpenses = chosen.filter((r) => r.type === 'expense').reduce((sum, r) => sum + r.amount, 0);
  const chosenIncome = chosen.filter((r) => r.type === 'income').reduce((sum, r) => sum + r.amount, 0);

  const toggleRow = (i: number) => {
    setExcluded((current) => {
      const next = new Set(current);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const toggleAll = () => {
    if (chosen.length === rows.length) setExcluded(new Set(rows.map((r) => r.i)));
    else setExcluded(new Set());
  };

  const similarRows = (row: ImportRow) =>
    row.description ? rows.filter((r) => r.i !== row.i && r.description === row.description) : [];

  const openEditor = (row: ImportRow) => {
    setEditing(row);
    setEditType(row.type);
    setApplyToSimilar(true);
  };

  const chooseCategory = (name: string) => {
    if (!editing) return;
    const targets = [editing, ...(applyToSimilar ? similarRows(editing) : [])];
    setChanges((current) => {
      const next = { ...current };
      for (const r of targets) next[r.i] = { category: name, type: editType };
      return next;
    });
    setEditing(null);
  };

  const commit = async () => {
    if (!preview) return;
    if (!preview.can_commit) {
      promptPro('Darmowy import został już wykorzystany. W CashFlo Pro importujesz wyciągi i arkusze bez limitu.', openPro);
      return;
    }
    if (chosen.length === 0) {
      setError('Zaznacz przynajmniej jedną transakcję.');
      return;
    }
    setError(null);
    setStep('saving');
    try {
      const payloadChanges: Record<string, RowChange> = {};
      for (const [i, change] of Object.entries(changes)) payloadChanges[i] = change;
      const { data } = await api.post('/import/commit', {
        session_id: preview.session_id,
        excluded: Array.from(excluded),
        changes: payloadChanges,
      });
      setImported(data.imported);
      setStep('done');
      loadHistory();
    } catch (e) {
      setStep('preview');
      if (isProLimitError(e)) {
        promptPro(apiErrorMessage(e, ''), openPro);
        return;
      }
      setError(apiErrorMessage(e, 'Nie udało się zaimportować transakcji. Spróbuj ponownie.'));
    }
  };

  const undoImport = (item: ImportHistoryItem) => {
    confirmAction(
      'Cofnąć import?',
      `Usuniemy ${item.count} ${transactionsWord(item.count)} dodanych z pliku „${item.file_name}”. Pozostałych transakcji to nie dotyczy.`,
      'Cofnij import',
      async () => {
        try {
          await api.delete(`/import/${item.id}`);
          loadHistory();
        } catch (e) {
          setError(apiErrorMessage(e, 'Nie udało się cofnąć importu.'));
        }
      }
    );
  };

  const resetToStart = () => {
    setPreview(null);
    setError(null);
    setStep('start');
  };

  // ---------------------------------------------------------------- views
  if (step === 'loading' || step === 'saving') {
    return (
      <View style={[styles.screen, styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>{step === 'saving' ? 'Zapisujemy transakcje…' : 'Czytamy plik…'}</Text>
      </View>
    );
  }

  if (step === 'done') {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xl }]}>
          <ScreenHeader title="Import" icon="close" onBack={() => router.back()} />
          <View style={styles.doneBox}>
            <View style={styles.doneIcon}>
              <Ionicons name="checkmark" size={36} color={colors.onPrimary} />
            </View>
            <Text style={styles.doneTitle}>
              Zaimportowano {imported} {transactionsWord(imported)}
            </Text>
            <Text style={styles.doneText}>Są już na liście transakcji, w statystykach i w podsumowaniu miesiąca.</Text>
          </View>
          <Card style={styles.nextCard}>
            <IconBubble name="repeat" color={colors.primary} />
            <View style={{ flex: 1, marginLeft: space.md }}>
              <Text style={styles.nextTitle}>Sprawdź swoje subskrypcje</Text>
              <Text style={styles.muted}>Poszukamy w historii płatności, które powtarzają się co miesiąc.</Text>
            </View>
          </Card>
          <Button title="Pokaż stałe płatności" icon="repeat" onPress={() => router.replace('/recurring')} />
          <Button
            title="Zobacz transakcje"
            variant="secondary"
            onPress={() => router.replace('/(tabs)/transactions')}
            style={{ marginTop: space.sm }}
          />
        </ScrollView>
      </View>
    );
  }

  if (step === 'columns' && preview) {
    const columnOptions = preview.columns.map((name, c) => {
      const example = preview.sample.find((row) => row[c])?.[c] || '';
      return { c, label: example ? `${name}: ${example.slice(0, 18)}` : name };
    });
    const picker = (value: number | null, onChange: (c: number | null) => void, optional = false) => (
      <View style={styles.chips}>
        {optional ? <Chip label="Brak" selected={value === null} onPress={() => onChange(null)} /> : null}
        {columnOptions.map((o) => (
          <Chip key={o.c} label={o.label} selected={value === o.c} onPress={() => onChange(o.c)} />
        ))}
      </View>
    );
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xl }]}>
          <ScreenHeader title="Wskaż kolumny" onBack={resetToStart} />
          <Text style={styles.intro}>
            Nie rozpoznaliśmy, gdzie w pliku „{preview.file_name}” jest data i kwota. Wybierz je poniżej, wystarczy raz.
          </Text>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sampleScroll}>
            <View>
              <View style={styles.sampleRow}>
                {preview.columns.map((name, c) => (
                  <Text key={c} style={[styles.sampleCell, styles.sampleHead]} numberOfLines={1}>
                    {name}
                  </Text>
                ))}
              </View>
              {preview.sample.slice(0, 3).map((row, r) => (
                <View key={r} style={styles.sampleRow}>
                  {preview.columns.map((_, c) => (
                    <Text key={c} style={styles.sampleCell} numberOfLines={1}>
                      {row[c] || ''}
                    </Text>
                  ))}
                </View>
              ))}
            </View>
          </ScrollView>

          <Text style={styles.label}>Data</Text>
          {picker(mapDate, setMapDate)}
          <Text style={styles.label}>Kwota</Text>
          {picker(mapAmount, setMapAmount)}
          <Text style={styles.label}>Opis (opcjonalnie)</Text>
          {picker(mapDescription, setMapDescription, true)}

          <View style={styles.switchRow}>
            <Text style={[styles.rowText, { flex: 1 }]}>Pierwszy wiersz to nazwy kolumn</Text>
            <Switch
              value={firstRowHeader}
              onValueChange={setFirstRowHeader}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <Button title="Pokaż transakcje" onPress={applyColumns} style={{ marginTop: space.lg }} />
        </ScrollView>
      </View>
    );
  }

  if (step === 'preview' && preview) {
    const s = preview.summary;
    const notes: { icon: React.ComponentProps<typeof Ionicons>['name']; text: string }[] = [];
    if (s.duplicates_exact > 0) {
      notes.push({ icon: 'copy-outline', text: `${s.duplicates_exact} ${transactionsWord(s.duplicates_exact)} z tego pliku już jest w aplikacji. Pominiemy je.` });
    }
    if (s.duplicates_possible > 0) {
      notes.push({ icon: 'help-circle-outline', text: `${s.duplicates_possible} wygląda na wpisane wcześniej ręcznie. Są odznaczone, sprawdź je.` });
    }
    if (preview.assumed_expenses) {
      notes.push({ icon: 'information-circle-outline', text: 'Plik ma same dodatnie kwoty, więc traktujemy je jako wydatki (przychody poznajemy po nazwie). Możesz to zmienić przy każdej pozycji.' });
    }
    if (preview.skipped > 0) {
      notes.push({ icon: 'remove-circle-outline', text: `Pominęliśmy ${preview.skipped} wierszy bez daty lub kwoty (np. blokady na karcie).` });
    }
    if (preview.foreign_currency > 0) {
      notes.push({ icon: 'globe-outline', text: `Pominęliśmy ${preview.foreign_currency} ${transactionsWord(preview.foreign_currency)} w innej walucie niż złoty.` });
    }

    const header = (
      <View>
        <ScreenHeader title="Sprawdź import" onBack={resetToStart} />
        <Card>
          <View style={styles.rowBetween}>
            <Text style={styles.cardLabel} numberOfLines={1}>
              {preview.file_name}
            </Text>
            <View style={styles.sourcePill}>
              <Text style={styles.sourceText}>{preview.source}</Text>
            </View>
          </View>
          <Text style={styles.foundTitle}>
            {s.count > 0 ? `Znaleźliśmy ${s.count} ${transactionsWord(s.count)}` : 'Nic nowego do dodania'}
          </Text>
          {s.date_from && s.date_to ? (
            <Text style={styles.muted}>
              {dayLabel(s.date_from)} – {dayLabel(s.date_to)}
            </Text>
          ) : null}
          {s.count > 0 ? (
            <View style={styles.totalsRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.totalLabel}>Wydatki ({s.expenses_count})</Text>
                <Text style={[styles.totalValue, tabular, { color: colors.expense }]}>{formatCurrency(s.expenses_total)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.totalLabel}>Przychody ({s.income_count})</Text>
                <Text style={[styles.totalValue, tabular, { color: colors.income }]}>{formatCurrency(s.income_total)}</Text>
              </View>
            </View>
          ) : (
            <Text style={[styles.muted, { marginTop: space.sm }]}>Wszystkie transakcje z tego pliku są już w aplikacji.</Text>
          )}
        </Card>

        {notes.length > 0 ? (
          <Card>
            {notes.map((n, index) => (
              <View key={index} style={[styles.noteRow, index > 0 && styles.divider]}>
                <Ionicons name={n.icon} size={18} color={colors.textSecondary} style={{ marginTop: 1 }} />
                <Text style={styles.noteText}>{n.text}</Text>
              </View>
            ))}
          </Card>
        ) : null}

        <TouchableOpacity onPress={() => setStep('columns')} style={styles.linkRow}>
          <Ionicons name="grid-outline" size={16} color={colors.primary} />
          <Text style={styles.link}>Dane się nie zgadzają? Wskaż kolumny</Text>
        </TouchableOpacity>

        {rows.length > 0 ? (
          <View style={styles.listHeader}>
            <Text style={styles.sectionTitle}>Transakcje</Text>
            <TouchableOpacity onPress={toggleAll} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.link}>{chosen.length === rows.length ? 'Odznacz wszystkie' : 'Zaznacz wszystkie'}</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        {rows.length > 0 ? <Text style={[styles.muted, { marginBottom: space.sm }]}>Stuknij kategorię, aby ją zmienić.</Text> : null}
      </View>
    );

    const editorCategories = categories.filter((c) => (c.type || 'expense') === editType);
    const similar = editing ? similarRows(editing) : [];

    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <FlatList
          data={rows}
          keyExtractor={(r) => String(r.i)}
          contentContainerStyle={[styles.content, { paddingBottom: 140 + insets.bottom }]}
          ListHeaderComponent={header}
          initialNumToRender={20}
          windowSize={10}
          renderItem={({ item, index }) => {
            const selected = !excluded.has(item.i);
            const isIncome = item.type === 'income';
            return (
              <View style={[styles.importRow, index === 0 && styles.importRowFirst, index === rows.length - 1 && styles.importRowLast, index > 0 && styles.divider]}>
                <TouchableOpacity
                  onPress={() => toggleRow(item.i)}
                  style={styles.checkbox}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                >
                  <Ionicons name={selected ? 'checkbox' : 'square-outline'} size={24} color={selected ? colors.primary : colors.textLight} />
                </TouchableOpacity>
                <View style={[styles.importMiddle, !selected && { opacity: 0.45 }]}>
                  <Text style={styles.importTitle} numberOfLines={1}>
                    {item.description || item.category}
                  </Text>
                  <View style={styles.importMeta}>
                    <Text style={styles.importDate}>{dayLabel(item.date)}</Text>
                    <TouchableOpacity onPress={() => openEditor(item)} style={styles.categoryButton} hitSlop={{ top: 6, bottom: 6 }}>
                      <Text style={styles.categoryButtonText} numberOfLines={1}>
                        {item.category}
                      </Text>
                      <Ionicons name="chevron-down" size={12} color={colors.primary} />
                    </TouchableOpacity>
                  </View>
                  {item.duplicate === 'possible' ? <Text style={styles.duplicateText}>Możliwy duplikat</Text> : null}
                </View>
                <Text style={[styles.importAmount, tabular, { color: isIncome ? colors.income : colors.text }, !selected && { opacity: 0.45 }]}>
                  {formatSignedCurrency(item.amount, item.type)}
                </Text>
              </View>
            );
          }}
        />

        {/* Bottom bar */}
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + space.md }]}>
          {error ? <Text style={[styles.errorText, { marginTop: 0, marginBottom: space.sm }]}>{error}</Text> : null}
          {preview.can_commit ? (
            <>
              <Button
                title={chosen.length > 0 ? `Importuj ${chosen.length} ${transactionsWord(chosen.length)}` : 'Zaznacz transakcje'}
                onPress={commit}
                disabled={chosen.length === 0}
              />
              {chosen.length > 0 ? (
                <Text style={[styles.bottomHint, tabular]}>
                  −{formatCurrency(chosenExpenses)} wydatków · +{formatCurrency(chosenIncome)} przychodów
                </Text>
              ) : null}
            </>
          ) : (
            <>
              <Button title="Importuj bez limitu w Pro" icon="star" onPress={openPro} />
              <Text style={styles.bottomHint}>Darmowy import został już wykorzystany. Podgląd zawsze jest za darmo.</Text>
            </>
          )}
        </View>

        {/* Change category */}
        <Sheet visible={!!editing} title={editing?.description || 'Kategoria'} onClose={() => setEditing(null)}>
          <SegmentedControl<TxType>
            value={editType}
            onChange={setEditType}
            options={[
              { value: 'expense', label: 'Wydatek', color: colors.expense },
              { value: 'income', label: 'Przychód', color: colors.income },
            ]}
          />
          <View style={[styles.chips, { marginTop: space.lg }]}>
            {editorCategories.map((c) => (
              <Chip
                key={c.id}
                label={c.name}
                icon={c.icon as any}
                color={c.color}
                selected={editing?.category === c.name && editing?.type === editType}
                onPress={() => chooseCategory(c.name)}
              />
            ))}
          </View>
          {similar.length > 0 ? (
            <View style={[styles.switchRow, { marginTop: space.md }]}>
              <Text style={[styles.rowText, { flex: 1 }]}>
                Zmień też {similar.length} {similar.length === 1 ? 'podobną' : 'podobne'} („{editing?.description}”)
              </Text>
              <Switch
                value={applyToSimilar}
                onValueChange={setApplyToSimilar}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#FFFFFF"
              />
            </View>
          ) : null}
        </Sheet>
      </View>
    );
  }

  // ---------------------------------------------------------------- start
  const pro = !!user?.is_pro;
  const freeUsed = !pro && history && !history.can_import;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xl }]}>
        <ScreenHeader title="Import z banku lub Excela" onBack={() => router.back()} />

        <View style={styles.hero}>
          <IconBubble name="cloud-upload-outline" color={colors.primary} size={64} />
          <Text style={styles.heroTitle}>Wszystkie wydatki naraz, bez przepisywania</Text>
          <Text style={styles.heroText}>
            Wgraj historię rachunku z banku albo swój arkusz z Excela. Rozpoznamy daty, kwoty i kategorie, a Ty tylko sprawdzisz wynik.
          </Text>
        </View>

        {error ? <Text style={[styles.errorText, { textAlign: 'center' }]}>{error}</Text> : null}
        <Button title="Wybierz plik CSV lub Excel" icon="document-attach-outline" onPress={pickFile} style={{ marginTop: space.md }} />
        <Text style={styles.centerNote}>
          {pro
            ? 'W CashFlo Pro importujesz bez limitu.'
            : freeUsed
            ? 'Darmowy import został wykorzystany. Podgląd pliku nadal działa, a import bez limitu masz w Pro.'
            : 'W wersji darmowej masz 1 import. Podgląd pliku jest zawsze za darmo.'}
        </Text>

        <TouchableOpacity style={styles.helpToggle} onPress={() => setShowHelp((v) => !v)} activeOpacity={0.7}>
          <Ionicons name="help-circle-outline" size={20} color={colors.primary} />
          <Text style={styles.helpToggleText}>Jak pobrać historię z banku?</Text>
          <Ionicons name={showHelp ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textLight} />
        </TouchableOpacity>
        {showHelp ? (
          <Card>
            {[
              'Zaloguj się do bankowości internetowej (na komputerze jest najwygodniej).',
              'Otwórz historię rachunku i wybierz okres, np. ostatnie 3 miesiące.',
              'Wybierz „Pobierz”, „Eksportuj” albo „Zapisz” i format CSV (albo Excel).',
              'Prześlij plik na telefon, np. mailem do siebie, i wybierz go tutaj.',
            ].map((text, index) => (
              <View key={index} style={[styles.helpRow, index > 0 && styles.divider]}>
                <View style={styles.helpNumber}>
                  <Text style={styles.helpNumberText}>{index + 1}</Text>
                </View>
                <Text style={styles.noteText}>{text}</Text>
              </View>
            ))}
            <Text style={[styles.muted, { marginTop: space.md, lineHeight: 19 }]}>
              Rozpoznajemy pliki m.in. z PKO BP, mBanku, ING, Pekao, Millennium i Revoluta. Własny arkusz też zadziała:
              wystarczą kolumny z datą i kwotą. Wyciągu w PDF nie da się zaimportować.
            </Text>
          </Card>
        ) : null}

        {history && history.imports.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Twoje importy</Text>
            <Card style={{ paddingVertical: space.xs }}>
              {history.imports.map((item, index) => (
                <View key={item.id} style={[styles.historyRow, index > 0 && styles.divider]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowText} numberOfLines={1}>
                      {item.file_name || item.source}
                    </Text>
                    <Text style={styles.muted}>
                      {item.count} {transactionsWord(item.count)} · {format(parseServerDate(item.created_at), 'd MMM yyyy', { locale: pl })}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => undoImport(item)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Text style={styles.undoText}>Cofnij</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </Card>
          </>
        ) : null}

        <View style={styles.privacyRow}>
          <Ionicons name="lock-closed-outline" size={14} color={colors.textLight} />
          <Text style={styles.privacyText}>Plik służy tylko do odczytania transakcji i jest usuwany z serwera najpóźniej po 2 godzinach.</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    center: { alignItems: 'center', justifyContent: 'center' },
    content: { paddingHorizontal: space.lg },
    loadingText: { marginTop: space.md, fontSize: 15, color: colors.textSecondary },
    hero: { alignItems: 'center', paddingVertical: space.lg },
    heroTitle: { fontSize: 22, fontWeight: '800', color: colors.text, textAlign: 'center', marginTop: space.md, letterSpacing: -0.3 },
    heroText: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', marginTop: space.sm, lineHeight: 21, maxWidth: 340 },
    centerNote: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', marginTop: space.sm, lineHeight: 18 },
    intro: { fontSize: 15, color: colors.textSecondary, lineHeight: 21, marginBottom: space.lg },
    helpToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: space.xl,
      marginBottom: space.md,
      paddingVertical: space.sm,
    },
    helpToggleText: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.primary, marginLeft: space.sm },
    helpRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: space.sm },
    helpNumber: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: colors.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    helpNumberText: { fontSize: 13, fontWeight: '800', color: colors.primary },
    sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.text, marginTop: space.lg, marginBottom: space.md },
    historyRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.md },
    undoText: { fontSize: 14, fontWeight: '700', color: colors.error },
    privacyRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: space.xl, paddingHorizontal: space.xs },
    privacyText: { flex: 1, fontSize: 12, color: colors.textLight, marginLeft: 6, lineHeight: 17 },
    rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    cardLabel: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginRight: space.sm },
    sourcePill: { backgroundColor: colors.primarySoft, paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill },
    sourceText: { fontSize: 12, fontWeight: '700', color: colors.primary },
    foundTitle: { fontSize: 22, fontWeight: '800', color: colors.text, marginTop: space.sm },
    totalsRow: { flexDirection: 'row', marginTop: space.lg },
    totalLabel: { fontSize: 13, color: colors.textSecondary },
    totalValue: { fontSize: 18, fontWeight: '800', marginTop: 2 },
    muted: { fontSize: 13, color: colors.textSecondary },
    noteRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: space.sm },
    noteText: { flex: 1, fontSize: 14, color: colors.text, lineHeight: 20, marginLeft: space.sm },
    divider: { borderTopWidth: 1, borderTopColor: colors.divider },
    linkRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.sm, marginBottom: space.sm },
    link: { fontSize: 14, fontWeight: '600', color: colors.primary, marginLeft: 6 },
    listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.sm },
    importRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      paddingHorizontal: space.md,
      paddingVertical: space.md,
      borderLeftWidth: 1,
      borderRightWidth: 1,
      borderColor: colors.border,
    },
    importRowFirst: { borderTopWidth: 1, borderTopLeftRadius: radius.md, borderTopRightRadius: radius.md },
    importRowLast: { borderBottomWidth: 1, borderBottomLeftRadius: radius.md, borderBottomRightRadius: radius.md },
    checkbox: { marginRight: space.md },
    importMiddle: { flex: 1, marginRight: space.sm },
    importTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
    importMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
    importDate: { fontSize: 13, color: colors.textSecondary, marginRight: space.sm },
    categoryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.primarySoft,
      borderRadius: radius.pill,
      paddingHorizontal: 8,
      paddingVertical: 2,
      maxWidth: 170,
    },
    categoryButtonText: { fontSize: 12, fontWeight: '700', color: colors.primary, marginRight: 2 },
    duplicateText: { fontSize: 12, fontWeight: '600', color: colors.warning, marginTop: 3 },
    importAmount: { fontSize: 15, fontWeight: '700' },
    bottomBar: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: space.lg,
      paddingTop: space.md,
      backgroundColor: colors.background,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    bottomHint: { fontSize: 12, color: colors.textSecondary, textAlign: 'center', marginTop: space.sm },
    label: { fontSize: 14, fontWeight: '700', color: colors.textSecondary, marginTop: space.lg, marginBottom: space.sm },
    chips: { flexDirection: 'row', flexWrap: 'wrap' },
    switchRow: { flexDirection: 'row', alignItems: 'center', marginTop: space.lg },
    rowText: { fontSize: 15, fontWeight: '600', color: colors.text },
    sampleScroll: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: space.sm,
    },
    sampleRow: { flexDirection: 'row' },
    sampleCell: { width: 120, fontSize: 12, color: colors.text, paddingVertical: 4, paddingHorizontal: 6 },
    sampleHead: { fontWeight: '800', color: colors.textSecondary },
    errorText: { color: colors.error, fontSize: 14, marginTop: space.md },
    doneBox: { alignItems: 'center', paddingVertical: space.xl },
    doneIcon: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    doneTitle: { fontSize: 24, fontWeight: '800', color: colors.text, marginTop: space.lg, textAlign: 'center' },
    doneText: { fontSize: 15, color: colors.textSecondary, marginTop: space.sm, textAlign: 'center', lineHeight: 21 },
    nextCard: { flexDirection: 'row', alignItems: 'center', marginTop: space.md },
    nextTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 2 },
  });
