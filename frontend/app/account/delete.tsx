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
  ActivityIndicator,
  Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { ScreenHeader } from '../../components/ui';

export default function DeleteAccountScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { user, deleteAccount } = useAuth();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const styles = createStyles(colors);
  const canDelete = password.length > 0 && understood && !deleting;

  const handleDelete = async () => {
    if (!canDelete) return;
    setError(null);
    setDeleting(true);
    try {
      await deleteAccount(password);
      router.replace('/auth/login');
    } catch (e: any) {
      setError(e.message);
      setDeleting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.contentContainer} keyboardShouldPersistTaps="handled">
        <ScreenHeader title="Usuń konto" onBack={() => router.back()} />

        <View style={styles.warningCard}>
          <Ionicons name="warning" size={28} color={colors.error} />
          <View style={styles.warningTextBox}>
            <Text style={styles.warningTitle}>Tej operacji nie da się cofnąć</Text>
            <Text style={styles.warningText}>
              Usuniemy konto {user?.email} oraz wszystkie zapisane w nim dane: transakcje,
              kategorie, budżet i cele oszczędnościowe.
              {user?.can_manage_subscription ? ' Twoja subskrypcja Pro zostanie anulowana, więc nie pobierzemy kolejnych opłat.' : ''}
            </Text>
          </View>
        </View>

        <Text style={styles.label}>Wpisz hasło, aby potwierdzić</Text>
        <View style={styles.inputContainer}>
          <Ionicons name="lock-closed-outline" size={20} color={colors.textSecondary} style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="Hasło"
            value={password}
            onChangeText={(t) => {
              setPassword(t);
              setError(null);
            }}
            secureTextEntry={!showPassword}
            autoComplete="password"
            autoCapitalize="none"
            placeholderTextColor={colors.textLight}
          />
          <TouchableOpacity
            onPress={() => setShowPassword(!showPassword)}
            accessibilityLabel={showPassword ? 'Ukryj hasło' : 'Pokaż hasło'}
          >
            <Ionicons
              name={showPassword ? 'eye-outline' : 'eye-off-outline'}
              size={20}
              color={colors.textSecondary}
            />
          </TouchableOpacity>
        </View>

        <View style={styles.confirmRow}>
          <Text style={styles.confirmText}>Rozumiem, że moje dane zostaną trwale usunięte</Text>
          <Switch
            value={understood}
            onValueChange={setUnderstood}
            trackColor={{ false: colors.border, true: colors.error }}
            thumbColor="#fff"
          />
        </View>

        {error && <Text style={styles.errorText}>{error}</Text>}

        <TouchableOpacity
          style={[styles.deleteButton, !canDelete && styles.deleteButtonDisabled]}
          onPress={handleDelete}
          disabled={!canDelete}
        >
          {deleting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="trash-outline" size={20} color="#fff" />
              <Text style={styles.deleteButtonText}>Usuń konto na zawsze</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.cancelButton} onPress={() => router.back()} disabled={deleting}>
          <Text style={styles.cancelText}>Anuluj</Text>
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
    paddingBottom: 40,
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
  warningCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.error + '12',
    borderWidth: 1,
    borderColor: colors.error + '55',
    borderRadius: 14,
    padding: 16,
    marginBottom: 24,
  },
  warningTextBox: {
    flex: 1,
    marginLeft: 12,
  },
  warningTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
  },
  warningText: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    paddingVertical: 12,
  },
  confirmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  confirmText: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    marginRight: 12,
  },
  errorText: {
    color: colors.error,
    fontSize: 14,
    marginBottom: 12,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.error,
    borderRadius: 12,
    padding: 16,
  },
  deleteButtonDisabled: {
    opacity: 0.45,
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  cancelButton: {
    alignItems: 'center',
    padding: 16,
    marginTop: 8,
  },
  cancelText: {
    color: colors.textSecondary,
    fontSize: 16,
    fontWeight: '500',
  },
});
