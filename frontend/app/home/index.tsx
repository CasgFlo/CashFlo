import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Linking,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const BRAND_GREEN = '#2F5B4C';
const BRAND_TEAL = '#4ECDC4';

export default function LandingPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const handleGetStarted = () => {
    router.push('/auth/register');
  };

  const handleLogin = () => {
    router.push('/auth/login');
  };

  const openEmail = () => {
    Linking.openURL('mailto:cashflo2026@gmail.com');
  };

  const openTerms = () => {
    router.push('/legal/terms');
  };

  const openPrivacy = () => {
    router.push('/legal/privacy');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}>
      {/* Hero Section */}
      <LinearGradient
        colors={[BRAND_GREEN, '#1F3D33']}
        style={[styles.heroSection, { paddingTop: insets.top + 20 }]}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <View style={styles.logoIcon}>
              <Ionicons name="wallet" size={24} color={BRAND_GREEN} />
            </View>
            <Text style={styles.logoText}>CashFlo</Text>
          </View>
          <TouchableOpacity style={styles.loginButton} onPress={handleLogin}>
            <Text style={styles.loginButtonText}>Zaloguj się</Text>
          </TouchableOpacity>
        </View>

        {/* Hero Content */}
        <View style={styles.heroContent}>
          <Text style={styles.heroTitle}>Kontroluj swoje{'\n'}finanse każdego dnia</Text>
          <Text style={styles.heroSubtitle}>
            CashFlo to inteligentna aplikacja do zarządzania finansami osobistymi.
            Śledź swój dzienny limit "Safe-to-Spend" i nigdy więcej nie przekrocz budżetu.
          </Text>
          <TouchableOpacity style={styles.ctaButton} onPress={handleGetStarted}>
            <Text style={styles.ctaButtonText}>Rozpocznij za darmo</Text>
            <Ionicons name="arrow-forward" size={20} color={BRAND_GREEN} />
          </TouchableOpacity>
        </View>

        {/* App Preview */}
        <View style={styles.appPreviewContainer}>
          <View style={styles.appPreview}>
            <View style={styles.previewHeader}>
              <Text style={styles.previewTitle}>Safe-to-Spend</Text>
              <Text style={styles.previewDate}>Dziś</Text>
            </View>
            <Text style={styles.previewAmount}>127,50 zł</Text>
            <View style={styles.previewProgress}>
              <View style={[styles.previewProgressFill, { width: '65%' }]} />
            </View>
            <Text style={styles.previewHint}>Zostało Ci 65% dziennego budżetu</Text>
          </View>
        </View>
      </LinearGradient>

      {/* Features Section */}
      <View style={styles.featuresSection}>
        <Text style={styles.sectionTitle}>Dlaczego CashFlo?</Text>
        
        <View style={styles.featureCard}>
          <View style={[styles.featureIcon, { backgroundColor: BRAND_TEAL + '20' }]}>
            <Ionicons name="shield-checkmark" size={28} color={BRAND_TEAL} />
          </View>
          <View style={styles.featureContent}>
            <Text style={styles.featureTitle}>Safe-to-Spend</Text>
            <Text style={styles.featureDescription}>
              Automatycznie obliczamy ile możesz bezpiecznie wydać każdego dnia, 
              uwzględniając Twoje stałe wydatki i cele oszczędnościowe.
            </Text>
          </View>
        </View>

        <View style={styles.featureCard}>
          <View style={[styles.featureIcon, { backgroundColor: '#FF6B6B20' }]}>
            <Ionicons name="pie-chart" size={28} color="#FF6B6B" />
          </View>
          <View style={styles.featureContent}>
            <Text style={styles.featureTitle}>Analiza wydatków</Text>
            <Text style={styles.featureDescription}>
              Przejrzyste wykresy i raporty pokazują na co wydajesz pieniądze. 
              Identyfikuj obszary do optymalizacji.
            </Text>
          </View>
        </View>

        <View style={styles.featureCard}>
          <View style={[styles.featureIcon, { backgroundColor: '#6C5CE720' }]}>
            <Ionicons name="flag" size={28} color="#6C5CE7" />
          </View>
          <View style={styles.featureContent}>
            <Text style={styles.featureTitle}>Cele oszczędnościowe</Text>
            <Text style={styles.featureDescription}>
              Ustal cele i śledź postępy. Wakacje, nowy laptop czy poduszka 
              finansowa - CashFlo pomoże Ci je osiągnąć.
            </Text>
          </View>
        </View>
      </View>

      {/* Pricing Section */}
      <View style={styles.pricingSection}>
        <Text style={styles.sectionTitle}>Prosty cennik</Text>
        <Text style={styles.sectionSubtitle}>Wybierz plan dopasowany do Twoich potrzeb</Text>

        <View style={styles.pricingCards}>
          {/* Free Plan */}
          <View style={styles.pricingCard}>
            <Text style={styles.planName}>Basic</Text>
            <View style={styles.priceRow}>
              <Text style={styles.priceAmount}>0 zł</Text>
              <Text style={styles.pricePeriod}>/miesiąc</Text>
            </View>
            <View style={styles.planFeatures}>
              <View style={styles.planFeatureItem}>
                <Ionicons name="checkmark" size={18} color={BRAND_GREEN} />
                <Text style={styles.planFeatureText}>Śledzenie wydatków</Text>
              </View>
              <View style={styles.planFeatureItem}>
                <Ionicons name="checkmark" size={18} color={BRAND_GREEN} />
                <Text style={styles.planFeatureText}>1 cel oszczędnościowy</Text>
              </View>
              <View style={styles.planFeatureItem}>
                <Ionicons name="checkmark" size={18} color={BRAND_GREEN} />
                <Text style={styles.planFeatureText}>3 własne kategorie</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.planButtonSecondary} onPress={handleGetStarted}>
              <Text style={styles.planButtonSecondaryText}>Rozpocznij za darmo</Text>
            </TouchableOpacity>
          </View>

          {/* Monthly Plan */}
          <View style={styles.pricingCard}>
            <Text style={styles.planName}>Miesięczny</Text>
            <View style={styles.priceRow}>
              <Text style={styles.priceAmount}>19,99 zł</Text>
              <Text style={styles.pricePeriod}>/miesiąc</Text>
            </View>
            <View style={styles.planFeatures}>
              <View style={styles.planFeatureItem}>
                <Ionicons name="checkmark" size={18} color={BRAND_GREEN} />
                <Text style={styles.planFeatureText}>Wszystko z Basic</Text>
              </View>
              <View style={styles.planFeatureItem}>
                <Ionicons name="checkmark" size={18} color={BRAND_GREEN} />
                <Text style={styles.planFeatureText}>Nieograniczone cele</Text>
              </View>
              <View style={styles.planFeatureItem}>
                <Ionicons name="checkmark" size={18} color={BRAND_GREEN} />
                <Text style={styles.planFeatureText}>Anuluj kiedy chcesz</Text>
              </View>
            </View>
            <TouchableOpacity 
              style={styles.planButtonSecondary} 
              onPress={() => Linking.openURL('https://buy.stripe.com/cNi7sM5tM7RZd9K4tj2B202')}
            >
              <Text style={styles.planButtonSecondaryText}>Wybierz</Text>
            </TouchableOpacity>
          </View>

          {/* Yearly Plan - POPULAR */}
          <View style={[styles.pricingCard, styles.pricingCardPremium]}>
            <View style={styles.popularBadge}>
              <Text style={styles.popularBadgeText}>NAJLEPSZY</Text>
            </View>
            <Text style={[styles.planName, { color: '#fff' }]}>Roczny</Text>
            <View style={styles.priceRow}>
              <Text style={[styles.priceAmount, { color: '#fff' }]}>99,99 zł</Text>
              <Text style={[styles.pricePeriod, { color: '#fff', opacity: 0.8 }]}>/rok</Text>
            </View>
            <Text style={styles.savingsText}>Oszczędzasz 140 zł rocznie!</Text>
            <View style={styles.planFeatures}>
              <View style={styles.planFeatureItem}>
                <Ionicons name="checkmark" size={18} color="#fff" />
                <Text style={[styles.planFeatureText, { color: '#fff' }]}>Wszystkie funkcje Pro</Text>
              </View>
              <View style={styles.planFeatureItem}>
                <Ionicons name="checkmark" size={18} color="#fff" />
                <Text style={[styles.planFeatureText, { color: '#fff' }]}>58% taniej niż miesięczny</Text>
              </View>
              <View style={styles.planFeatureItem}>
                <Ionicons name="checkmark" size={18} color="#fff" />
                <Text style={[styles.planFeatureText, { color: '#fff' }]}>Priorytetowe wsparcie</Text>
              </View>
            </View>
            <TouchableOpacity 
              style={styles.planButtonPrimary} 
              onPress={() => Linking.openURL('https://buy.stripe.com/dRmfZi1dwb4b9XybVL2B200')}
            >
              <Text style={styles.planButtonPrimaryText}>Wybierz Roczny</Text>
            </TouchableOpacity>
          </View>

          {/* Lifetime Plan */}
          <View style={[styles.pricingCard, styles.pricingCardLifetime]}>
            <View style={styles.lifetimeBadge}>
              <Ionicons name="infinite" size={16} color="#fff" />
            </View>
            <Text style={styles.planName}>Bezterminowy</Text>
            <View style={styles.priceRow}>
              <Text style={styles.priceAmount}>199 zł</Text>
              <Text style={styles.pricePeriod}>jednorazowo</Text>
            </View>
            <Text style={styles.lifetimeNote}>Płacisz raz, masz na zawsze!</Text>
            <View style={styles.planFeatures}>
              <View style={styles.planFeatureItem}>
                <Ionicons name="checkmark" size={18} color={BRAND_GREEN} />
                <Text style={styles.planFeatureText}>Wszystkie funkcje Pro</Text>
              </View>
              <View style={styles.planFeatureItem}>
                <Ionicons name="checkmark" size={18} color={BRAND_GREEN} />
                <Text style={styles.planFeatureText}>Dostęp na zawsze</Text>
              </View>
              <View style={styles.planFeatureItem}>
                <Ionicons name="checkmark" size={18} color={BRAND_GREEN} />
                <Text style={styles.planFeatureText}>Wszystkie przyszłe aktualizacje</Text>
              </View>
            </View>
            <TouchableOpacity 
              style={[styles.planButtonSecondary, { borderColor: BRAND_GREEN }]} 
              onPress={() => Linking.openURL('https://buy.stripe.com/eVqaEY1dwfkr6Lmf7X2B201')}
            >
              <Text style={styles.planButtonSecondaryText}>Kup na zawsze</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Payment Methods */}
      <View style={styles.paymentSection}>
        <Text style={styles.paymentTitle}>Akceptujemy płatności</Text>
        <View style={styles.paymentLogos}>
          <View style={styles.paymentLogo}>
            <Ionicons name="logo-apple" size={28} color="#000" />
            <Text style={styles.paymentLogoText}>Apple Pay</Text>
          </View>
          <View style={styles.paymentLogo}>
            <Ionicons name="logo-google" size={28} color="#4285F4" />
            <Text style={styles.paymentLogoText}>Google Pay</Text>
          </View>
          <View style={styles.paymentLogo}>
            <View style={styles.blikLogo}>
              <Text style={styles.blikText}>BLIK</Text>
            </View>
          </View>
          <View style={styles.paymentLogo}>
            <Ionicons name="card" size={28} color="#1A1F71" />
            <Text style={styles.paymentLogoText}>Karta</Text>
          </View>
        </View>
      </View>

      {/* Contact Section */}
      <View style={styles.contactSection}>
        <Text style={styles.sectionTitle}>Kontakt</Text>
        <Text style={styles.contactDescription}>
          Masz pytania? Chętnie pomożemy!
        </Text>

        <View style={styles.contactCard}>
          <View style={styles.contactItem}>
            <View style={[styles.contactIcon, { backgroundColor: BRAND_GREEN + '15' }]}>
              <Ionicons name="mail" size={24} color={BRAND_GREEN} />
            </View>
            <View style={styles.contactInfo}>
              <Text style={styles.contactLabel}>Email</Text>
              <TouchableOpacity onPress={openEmail}>
                <Text style={styles.contactValue}>cashflo2026@gmail.com</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.contactDivider} />

          <View style={styles.contactItem}>
            <View style={[styles.contactIcon, { backgroundColor: BRAND_TEAL + '15' }]}>
              <Ionicons name="call" size={24} color={BRAND_TEAL} />
            </View>
            <View style={styles.contactInfo}>
              <Text style={styles.contactLabel}>Telefon</Text>
              <Text style={styles.contactValue}>+48 XXX XXX XXX</Text>
            </View>
          </View>
        </View>

        <Text style={styles.responseTime}>
          Odpowiadamy w ciągu 24 godzin w dni robocze
        </Text>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <View style={styles.footerTop}>
          <View style={styles.footerLogo}>
            <View style={styles.footerLogoIcon}>
              <Ionicons name="wallet" size={20} color="#fff" />
            </View>
            <Text style={styles.footerLogoText}>CashFlo</Text>
          </View>
          <Text style={styles.footerTagline}>
            Twój inteligentny asystent finansowy
          </Text>
        </View>

        <View style={styles.footerLinks}>
          <TouchableOpacity onPress={openTerms}>
            <Text style={styles.footerLink}>Regulamin</Text>
          </TouchableOpacity>
          <Text style={styles.footerDot}>•</Text>
          <TouchableOpacity onPress={openPrivacy}>
            <Text style={styles.footerLink}>Polityka Prywatności</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.copyright}>
          © {new Date().getFullYear()} CashFlo. Wszelkie prawa zastrzeżone.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  // Hero Section
  heroSection: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 40,
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  logoText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  loginButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  heroContent: {
    marginBottom: 40,
  },
  heroTitle: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#fff',
    lineHeight: 44,
    marginBottom: 16,
  },
  heroSubtitle: {
    fontSize: 16,
    color: '#fff',
    opacity: 0.9,
    lineHeight: 24,
    marginBottom: 28,
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    paddingVertical: 16,
    paddingHorizontal: 28,
    borderRadius: 30,
    alignSelf: 'flex-start',
  },
  ctaButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: BRAND_GREEN,
    marginRight: 8,
  },
  appPreviewContainer: {
    alignItems: 'center',
  },
  appPreview: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 320,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  previewTitle: {
    fontSize: 14,
    color: '#757575',
    fontWeight: '600',
  },
  previewDate: {
    fontSize: 12,
    color: '#9E9E9E',
  },
  previewAmount: {
    fontSize: 42,
    fontWeight: 'bold',
    color: BRAND_GREEN,
    marginBottom: 16,
  },
  previewProgress: {
    height: 8,
    backgroundColor: '#E0E0E0',
    borderRadius: 4,
    marginBottom: 8,
  },
  previewProgressFill: {
    height: '100%',
    backgroundColor: BRAND_TEAL,
    borderRadius: 4,
  },
  previewHint: {
    fontSize: 13,
    color: '#757575',
    textAlign: 'center',
  },
  // Features Section
  featuresSection: {
    padding: 24,
    backgroundColor: '#F8F9FA',
  },
  sectionTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 8,
    textAlign: 'center',
  },
  sectionSubtitle: {
    fontSize: 16,
    color: '#757575',
    textAlign: 'center',
    marginBottom: 24,
  },
  featureCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  featureIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  featureContent: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 6,
  },
  featureDescription: {
    fontSize: 14,
    color: '#757575',
    lineHeight: 20,
  },
  // Pricing Section
  pricingSection: {
    padding: 24,
    backgroundColor: '#fff',
  },
  pricingCards: {
    flexDirection: 'column',
    gap: 16,
  },
  pricingCard: {
    backgroundColor: '#F8F9FA',
    borderRadius: 20,
    padding: 24,
    borderWidth: 2,
    borderColor: '#E0E0E0',
  },
  pricingCardPremium: {
    backgroundColor: BRAND_GREEN,
    borderColor: BRAND_GREEN,
    position: 'relative',
    overflow: 'hidden',
  },
  pricingCardLifetime: {
    backgroundColor: '#FFF8E7',
    borderColor: '#F5A623',
    position: 'relative',
  },
  popularBadge: {
    position: 'absolute',
    top: 12,
    right: -30,
    backgroundColor: BRAND_TEAL,
    paddingVertical: 4,
    paddingHorizontal: 40,
    transform: [{ rotate: '45deg' }],
  },
  popularBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  lifetimeBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: '#F5A623',
    padding: 6,
    borderRadius: 12,
  },
  savingsText: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
    marginBottom: 16,
    backgroundColor: BRAND_TEAL,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  lifetimeNote: {
    fontSize: 13,
    color: '#F5A623',
    fontWeight: '600',
    marginBottom: 16,
  },
  planName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 20,
  },
  priceAmount: {
    fontSize: 40,
    fontWeight: 'bold',
    color: BRAND_GREEN,
  },
  pricePeriod: {
    fontSize: 16,
    color: '#757575',
    marginLeft: 4,
  },
  planFeatures: {
    marginBottom: 20,
  },
  planFeatureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  planFeatureText: {
    fontSize: 14,
    color: '#1A1A1A',
    marginLeft: 10,
  },
  planButtonSecondary: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: BRAND_GREEN,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  planButtonSecondaryText: {
    fontSize: 16,
    fontWeight: '600',
    color: BRAND_GREEN,
  },
  planButtonPrimary: {
    backgroundColor: '#fff',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  planButtonPrimaryText: {
    fontSize: 16,
    fontWeight: '600',
    color: BRAND_GREEN,
  },
  comingSoonNote: {
    fontSize: 12,
    color: '#fff',
    opacity: 0.7,
    textAlign: 'center',
    marginTop: 12,
  },
  // Payment Section
  paymentSection: {
    padding: 24,
    backgroundColor: '#F8F9FA',
    alignItems: 'center',
  },
  paymentTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#757575',
    marginBottom: 20,
  },
  paymentLogos: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 20,
  },
  paymentLogo: {
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    minWidth: 80,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  paymentLogoText: {
    fontSize: 11,
    color: '#757575',
    marginTop: 6,
    fontWeight: '500',
  },
  blikLogo: {
    backgroundColor: '#E30613',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  blikText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  // Contact Section
  contactSection: {
    padding: 24,
    backgroundColor: '#fff',
  },
  contactDescription: {
    fontSize: 16,
    color: '#757575',
    textAlign: 'center',
    marginBottom: 24,
  },
  contactCard: {
    backgroundColor: '#F8F9FA',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  contactIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  contactInfo: {
    flex: 1,
  },
  contactLabel: {
    fontSize: 12,
    color: '#9E9E9E',
    marginBottom: 2,
  },
  contactValue: {
    fontSize: 16,
    color: BRAND_GREEN,
    fontWeight: '600',
  },
  contactDivider: {
    height: 1,
    backgroundColor: '#E0E0E0',
    marginVertical: 16,
  },
  responseTime: {
    fontSize: 13,
    color: '#9E9E9E',
    textAlign: 'center',
  },
  // Footer
  footer: {
    backgroundColor: '#1A1A1A',
    padding: 32,
    alignItems: 'center',
  },
  footerTop: {
    alignItems: 'center',
    marginBottom: 24,
  },
  footerLogo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  footerLogoIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: BRAND_GREEN,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  footerLogoText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  footerTagline: {
    fontSize: 14,
    color: '#9E9E9E',
  },
  footerLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  footerLink: {
    fontSize: 14,
    color: '#B0B0B0',
    fontWeight: '500',
  },
  footerDot: {
    color: '#757575',
    marginHorizontal: 12,
  },
  copyright: {
    fontSize: 12,
    color: '#757575',
    textAlign: 'center',
  },
});
