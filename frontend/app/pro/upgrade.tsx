import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  Platform,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { LinearGradient } from 'expo-linear-gradient';

// Stripe Payment Links from environment variables
const PAYMENT_LINKS = {
  monthly: process.env.EXPO_PUBLIC_STRIPE_MONTHLY_LINK || 'https://buy.stripe.com/cNi7sM5tM7RZd9K4tj2B202',
  yearly: process.env.EXPO_PUBLIC_STRIPE_YEARLY_LINK || 'https://buy.stripe.com/dRmfZi1dwb4b9XybVL2B200',
  lifetime: process.env.EXPO_PUBLIC_STRIPE_LIFETIME_LINK || 'https://buy.stripe.com/eVqaEY1dwfkr6Lmf7X2B201',
};

interface PricingPlan {
  id: 'monthly' | 'yearly' | 'lifetime';
  name: string;
  price: string;
  period: string;
  savings?: string;
  popular?: boolean;
  features: string[];
}

const PRICING_PLANS: PricingPlan[] = [
  {
    id: 'monthly',
    name: 'Miesięczny',
    price: '19,99',
    period: 'zł / miesiąc',
    features: ['Wszystkie funkcje Pro', 'Anuluj kiedy chcesz'],
  },
  {
    id: 'yearly',
    name: 'Roczny',
    price: '99,99',
    period: 'zł / rok',
    savings: 'Oszczędzasz 140 zł!',
    popular: true,
    features: ['Wszystkie funkcje Pro', '58% taniej niż miesięczny', 'Priorytetowe wsparcie'],
  },
  {
    id: 'lifetime',
    name: 'Bezterminowy',
    price: '199',
    period: 'zł jednorazowo',
    savings: 'Płacisz raz, masz na zawsze!',
    features: ['Wszystkie funkcje Pro', 'Dostęp na zawsze', 'Wszystkie przyszłe aktualizacje'],
  },
];

const PRO_FEATURES = [
  { icon: 'flag', title: 'Nieograniczone cele oszczędnościowe' },
  { icon: 'pricetags', title: 'Nieograniczone własne kategorie' },
  { icon: 'filter', title: 'Zaawansowane filtrowanie transakcji' },
  { icon: 'analytics', title: 'Szczegółowe raporty i statystyki' },
  { icon: 'notifications', title: 'Powiadomienia o budżecie' },
];

export default function ProUpgradeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { user } = useAuth();
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly' | 'lifetime'>('yearly');

  const styles = createStyles(colors);

  const handlePurchase = async (planId: 'monthly' | 'yearly' | 'lifetime') => {
    const url = PAYMENT_LINKS[planId];
    
    try {
      if (Platform.OS === 'web') {
        window.open(url, '_blank');
      } else {
        const canOpen = await Linking.canOpenURL(url);
        if (canOpen) {
          await Linking.openURL(url);
        }
      }
    } catch (error) {
      console.error('Error opening payment link:', error);
    }
  };

  // If user is already Pro
  if (user?.is_pro) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={28} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>CashFlo Pro</Text>
          <View style={{ width: 44 }} />
        </View>
        
        <View style={styles.proActiveContainer}>
          <LinearGradient
            colors={[colors.warning, '#F5A623']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.proActiveCard}
          >
            <Ionicons name="checkmark-circle" size={80} color="#fff" />
            <Text style={styles.proActiveTitle}>Jesteś użytkownikiem Pro!</Text>
            <Text style={styles.proActiveSubtitle}>
              Masz dostęp do wszystkich funkcji premium
            </Text>
          </LinearGradient>
          
          <View style={styles.featuresActiveList}>
            {PRO_FEATURES.map((feature, index) => (
              <View key={index} style={styles.featureActiveItem}>
                <Ionicons name="checkmark-circle" size={24} color={colors.success} />
                <Text style={styles.featureActiveText}>{feature.title}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>CashFlo Pro</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.contentContainer, { paddingBottom: insets.bottom + 20 }]}>
        {/* Hero */}
        <View style={styles.heroSection}>
          <LinearGradient
            colors={[colors.warning, '#F5A623']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroIcon}
          >
            <Ionicons name="star" size={40} color="#fff" />
          </LinearGradient>
          <Text style={styles.heroTitle}>Odblokuj pełny potencjał</Text>
          <Text style={styles.heroSubtitle}>
            Zarządzaj finansami bez ograniczeń
          </Text>
        </View>

        {/* Pricing Cards */}
        <View style={styles.pricingSection}>
          {PRICING_PLANS.map((plan) => (
            <TouchableOpacity
              key={plan.id}
              style={[
                styles.pricingCard,
                selectedPlan === plan.id && styles.pricingCardSelected,
                plan.popular && styles.pricingCardPopular,
              ]}
              onPress={() => setSelectedPlan(plan.id)}
              activeOpacity={0.8}
            >
              {plan.popular && (
                <View style={styles.popularBadge}>
                  <Text style={styles.popularBadgeText}>NAJLEPSZY</Text>
                </View>
              )}
              
              <View style={styles.radioContainer}>
                <View style={[
                  styles.radio,
                  selectedPlan === plan.id && styles.radioSelected
                ]}>
                  {selectedPlan === plan.id && (
                    <View style={styles.radioInner} />
                  )}
                </View>
              </View>
              
              <View style={styles.planInfo}>
                <Text style={[
                  styles.planName,
                  selectedPlan === plan.id && styles.planNameSelected
                ]}>
                  {plan.name}
                </Text>
                <View style={styles.priceRow}>
                  <Text style={[
                    styles.planPrice,
                    selectedPlan === plan.id && styles.planPriceSelected
                  ]}>
                    {plan.price}
                  </Text>
                  <Text style={[
                    styles.planPeriod,
                    selectedPlan === plan.id && styles.planPeriodSelected
                  ]}>
                    {plan.period}
                  </Text>
                </View>
                {plan.savings && (
                  <Text style={styles.savingsBadge}>{plan.savings}</Text>
                )}
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* CTA Button */}
        <TouchableOpacity 
          style={styles.ctaButton}
          onPress={() => handlePurchase(selectedPlan)}
        >
          <LinearGradient
            colors={[colors.warning, '#F5A623']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.ctaButtonGradient}
          >
            <Ionicons name="star" size={24} color="#fff" />
            <Text style={styles.ctaButtonText}>
              Kup {PRICING_PLANS.find(p => p.id === selectedPlan)?.name} za {PRICING_PLANS.find(p => p.id === selectedPlan)?.price} zł
            </Text>
          </LinearGradient>
        </TouchableOpacity>

        {/* Payment Methods - Redesigned */}
        <View style={styles.paymentSection}>
          <Text style={styles.paymentTitle}>Bezpieczne płatności przez Stripe</Text>
          <View style={styles.paymentGrid}>
            {/* Visa */}
            <View style={styles.paymentCard}>
              <View style={[styles.paymentIconBg, { backgroundColor: '#1A1F71' }]}>
                <Text style={styles.visaText}>VISA</Text>
              </View>
            </View>
            {/* Mastercard */}
            <View style={styles.paymentCard}>
              <View style={styles.mastercardIcon}>
                <View style={[styles.mastercardCircle, { backgroundColor: '#EB001B', left: 0 }]} />
                <View style={[styles.mastercardCircle, { backgroundColor: '#F79E1B', right: 0 }]} />
              </View>
            </View>
            {/* BLIK */}
            <View style={styles.paymentCard}>
              <View style={[styles.paymentIconBg, { backgroundColor: '#E30613' }]}>
                <Text style={styles.blikTextNew}>BLIK</Text>
              </View>
            </View>
            {/* Przelewy24 */}
            <View style={styles.paymentCard}>
              <View style={[styles.paymentIconBg, { backgroundColor: '#D13239' }]}>
                <Text style={styles.p24TextNew}>P24</Text>
              </View>
            </View>
            {/* Apple Pay */}
            <View style={styles.paymentCard}>
              <View style={[styles.paymentIconBg, { backgroundColor: '#000' }]}>
                <Ionicons name="logo-apple" size={20} color="#fff" />
                <Text style={styles.applePayText}>Pay</Text>
              </View>
            </View>
            {/* Google Pay */}
            <View style={styles.paymentCard}>
              <View style={[styles.paymentIconBg, { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd' }]}>
                <Ionicons name="logo-google" size={18} color="#4285F4" />
                <Text style={styles.googlePayText}>Pay</Text>
              </View>
            </View>
          </View>
          <View style={styles.securityBadge}>
            <Ionicons name="lock-closed" size={14} color={colors.success} />
            <Text style={styles.securityText}>Szyfrowanie SSL 256-bit</Text>
          </View>
        </View>

        {/* Features List */}
        <View style={styles.featuresSection}>
          <Text style={styles.featuresTitle}>Co zyskujesz z Pro?</Text>
          {PRO_FEATURES.map((feature, index) => (
            <View key={index} style={styles.featureItem}>
              <View style={styles.featureIconContainer}>
                <Ionicons name={feature.icon as any} size={24} color={colors.primary} />
              </View>
              <Text style={styles.featureText}>{feature.title}</Text>
              <Ionicons name="checkmark-circle" size={22} color={colors.success} />
            </View>
          ))}
        </View>

        {/* Guarantee */}
        <View style={styles.guaranteeSection}>
          <Ionicons name="shield-checkmark" size={32} color={colors.success} />
          <Text style={styles.guaranteeTitle}>Gwarancja satysfakcji</Text>
          <Text style={styles.guaranteeText}>
            Jeśli nie będziesz zadowolony, zwrócimy Ci pieniądze w ciągu 14 dni.
            Bez pytań, bez problemów.
          </Text>
        </View>

        {/* Footer note */}
        <Text style={styles.footerNote}>
          Płatność przetworzona przez Stripe. Twoje dane są bezpieczne.
        </Text>

        {/* Terms and Privacy Links */}
        <View style={styles.legalLinksContainer}>
          <Text style={styles.legalText}>
            Kontynuując zakup, akceptujesz{' '}
          </Text>
          <TouchableOpacity onPress={() => router.push('/terms')}>
            <Text style={styles.legalLink}>Regulamin</Text>
          </TouchableOpacity>
          <Text style={styles.legalText}> oraz </Text>
          <TouchableOpacity onPress={() => router.push('/privacy')}>
            <Text style={styles.legalLink}>Politykę Prywatności</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
  },
  contentContainer: {
    padding: 20,
  },
  // Hero
  heroSection: {
    alignItems: 'center',
    marginBottom: 28,
  },
  heroIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#F5A623',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  heroSubtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  // Pricing Cards
  pricingSection: {
    marginBottom: 20,
  },
  pricingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: colors.border,
    position: 'relative',
    overflow: 'hidden',
  },
  pricingCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '08',
  },
  pricingCardPopular: {
    borderColor: colors.warning,
  },
  popularBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: colors.warning,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderBottomLeftRadius: 12,
  },
  popularBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  radioContainer: {
    marginRight: 14,
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioSelected: {
    borderColor: colors.primary,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.primary,
  },
  planInfo: {
    flex: 1,
  },
  planName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  planNameSelected: {
    color: colors.primary,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  planPrice: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
  },
  planPriceSelected: {
    color: colors.primary,
  },
  planPeriod: {
    fontSize: 14,
    color: colors.textSecondary,
    marginLeft: 4,
  },
  planPeriodSelected: {
    color: colors.primary,
  },
  savingsBadge: {
    fontSize: 12,
    color: colors.success,
    fontWeight: '600',
    marginTop: 4,
  },
  // CTA Button
  ctaButton: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 20,
    shadowColor: '#F5A623',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  ctaButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    paddingHorizontal: 24,
  },
  ctaButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginLeft: 10,
  },
  // Payment Section - New Design
  paymentSection: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    alignItems: 'center',
  },
  paymentTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 16,
  },
  paymentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 16,
  },
  paymentCard: {
    alignItems: 'center',
  },
  paymentIconBg: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    minWidth: 70,
    height: 44,
  },
  visaText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    fontStyle: 'italic',
  },
  mastercardIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 70,
    height: 44,
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    justifyContent: 'center',
    position: 'relative',
  },
  mastercardCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    position: 'absolute',
  },
  blikTextNew: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  p24TextNew: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  applePayText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 2,
  },
  googlePayText: {
    color: '#5F6368',
    fontSize: 13,
    fontWeight: '500',
    marginLeft: 2,
  },
  securityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.success + '15',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  securityText: {
    fontSize: 12,
    color: colors.success,
    marginLeft: 6,
    fontWeight: '500',
  },
  // Features
  featuresSection: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  featuresTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 16,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  featureIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  featureText: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
  },
  // Guarantee
  guaranteeSection: {
    alignItems: 'center',
    backgroundColor: colors.success + '10',
    borderRadius: 16,
    padding: 24,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.success + '30',
  },
  guaranteeTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text,
    marginTop: 12,
    marginBottom: 8,
  },
  guaranteeText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  // Footer
  footerNote: {
    fontSize: 12,
    color: colors.textLight,
    textAlign: 'center',
  },
  legalLinksContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
    paddingHorizontal: 16,
  },
  legalText: {
    fontSize: 12,
    color: colors.textLight,
  },
  legalLink: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  // Pro Active
  proActiveContainer: {
    flex: 1,
    padding: 16,
  },
  proActiveCard: {
    borderRadius: 24,
    padding: 40,
    alignItems: 'center',
    marginBottom: 24,
  },
  proActiveTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 16,
    marginBottom: 8,
  },
  proActiveSubtitle: {
    fontSize: 16,
    color: '#fff',
    opacity: 0.9,
    textAlign: 'center',
  },
  featuresActiveList: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
  },
  featureActiveItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  featureActiveText: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
    marginLeft: 12,
  },
});
