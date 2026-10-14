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
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';

export default function ContactSupportScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [message, setMessage] = useState('');

  const supportEmail = 'cashflo2026@gmail.com';
  const styles = createStyles(colors, isDark);

  const handleSendEmail = () => {
    if (!message.trim()) {
      Alert.alert('Błąd', 'Proszę wpisać wiadomość');
      return;
    }

    const subject = `Pomoc CashFlo - ${name}`;
    const body = `
Imię: ${name}
Email: ${email}

Wiadomość:
${message}
    `.trim();

    const mailtoUrl = `mailto:${supportEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    Linking.openURL(mailtoUrl)
      .then(() => {
        Alert.alert(
          'Sukces',
          'Dziękujemy za kontakt! Odpowiemy najszybciej jak to możliwe.',
          [{ text: 'OK', onPress: () => router.back() }]
        );
      })
      .catch((error) => {
        console.error('Error opening email:', error);
        Alert.alert('Błąd', 'Nie można otworzyć klienta email');
      });
  };

  const faqItems = [
    {
      question: 'Jak dodać transakcję?',
      answer: 'Na ekranie głównym lub w zakładce Transakcje kliknij przycisk + i wpisz kwotę.',
    },
    {
      question: 'Jak poprawić albo usunąć transakcję?',
      answer: 'Kliknij transakcję na liście. Otworzy się edycja, a ikona kosza w prawym górnym rogu ją usuwa.',
    },
    {
      question: 'Jak ustawić cel oszczędnościowy?',
      answer: 'Przejdź do zakładki Cele i kliknij przycisk +, aby utworzyć nowy cel.',
    },
    {
      question: 'Jak zmienić budżet miesięczny?',
      answer: 'W zakładce Więcej wybierz Budżet miesięczny i ustaw nowy limit.',
    },
    {
      question: 'Nie pamiętam hasła. Co zrobić?',
      answer: 'Na ekranie logowania kliknij „Nie pamiętasz hasła?”. Wyślemy Ci kod do ustawienia nowego hasła.',
    },
    {
      question: 'Jak anulować subskrypcję Pro?',
      answer: 'W zakładce Więcej wybierz Zarządzaj subskrypcją. Pro działa do końca opłaconego okresu. W razie problemów napisz na cashflo2026@gmail.com.',
    },
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header with SafeArea */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Pomoc i wsparcie</Text>
        <View style={{ width: 44 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={[styles.contentContainer, { paddingBottom: insets.bottom + 20 }]}
          keyboardShouldPersistTaps="handled"
        >
          {/* Contact Card */}
          <View style={styles.contactCard}>
            <View style={styles.contactIconContainer}>
              <Ionicons name="mail" size={32} color="#fff" />
            </View>
            <Text style={styles.contactTitle}>Skontaktuj się z nami</Text>
            <Text style={styles.contactText}>
              Masz pytanie lub problem? Napisz do nas!
            </Text>
            <TouchableOpacity
              style={styles.emailButton}
              onPress={() => Linking.openURL(`mailto:${supportEmail}`)}
            >
              <Ionicons name="mail-outline" size={20} color="#fff" />
              <Text style={styles.emailButtonText}>{supportEmail}</Text>
            </TouchableOpacity>
          </View>

          {/* FAQ Section */}
          <Text style={styles.sectionTitle}>Często zadawane pytania</Text>
          {faqItems.map((item, index) => (
            <View key={index} style={styles.faqItem}>
              <View style={styles.faqQuestion}>
                <Ionicons name="help-circle" size={22} color={colors.primary} />
                <Text style={styles.faqQuestionText}>{item.question}</Text>
              </View>
              <Text style={styles.faqAnswer}>{item.answer}</Text>
            </View>
          ))}

          {/* Contact Form */}
          <Text style={styles.sectionTitle}>Formularz kontaktowy</Text>
          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Imię</Text>
              <TextInput
                style={styles.input}
                placeholder="Twoje imię"
                value={name}
                onChangeText={setName}
                placeholderTextColor={colors.textLight}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                placeholder="twoj@email.com"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                placeholderTextColor={colors.textLight}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Wiadomość</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Opisz swój problem lub pytanie..."
                value={message}
                onChangeText={setMessage}
                multiline
                numberOfLines={5}
                textAlignVertical="top"
                placeholderTextColor={colors.textLight}
              />
            </View>

            <TouchableOpacity style={styles.sendButton} onPress={handleSendEmail}>
              <Ionicons name="send" size={20} color="#fff" />
              <Text style={styles.sendButtonText}>Wyślij wiadomość</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const createStyles = (colors: any, isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  contentContainer: {
    padding: 16,
  },
  contactCard: {
    backgroundColor: colors.primary,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
  },
  contactIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  contactTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  contactText: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.9,
    textAlign: 'center',
    marginBottom: 16,
  },
  emailButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
  },
  emailButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 16,
  },
  faqItem: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  faqQuestion: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  faqQuestionText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    marginLeft: 10,
    flex: 1,
  },
  faqAnswer: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
    marginLeft: 32,
  },
  form: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  textArea: {
    minHeight: 120,
    textAlignVertical: 'top',
  },
  sendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 8,
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
});
