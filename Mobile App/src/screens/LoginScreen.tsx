import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../contexts/AuthContext';
import AdBanner from '../components/AdBanner';

type LoginMode = 'email' | 'enrollment';

export default function LoginScreen() {
  const { login } = useAuth();
  const [mode, setMode] = useState<LoginMode>('email');
  const [email, setEmail] = useState('');
  const [enrollment, setEnrollment] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    const identifier = mode === 'email' ? email : enrollment;
    if (!identifier) {
      Alert.alert(
        'Error',
        mode === 'email' ? 'Please enter your email.' : 'Please enter your enrollment number.'
      );
      return;
    }
    if (!password) {
      Alert.alert('Error', 'Please enter your password.');
      return;
    }

    setLoading(true);
    const success = await login(identifier, password);
    setLoading(false);

    if (!success) {
      Alert.alert('Login Failed', 'Invalid credentials. Please try again.');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar style="dark" />
      
      {/* Google Ads Banner at top - horizontal banner */}
      <AdBanner size="banner" />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Logo & Header */}
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <Text style={styles.logoIcon}>🎓</Text>
          </View>
          <Text style={styles.appTitle}>Apex SMS</Text>
          <Text style={styles.appSubtitle}>Student Management System</Text>
        </View>

        {/* Login Mode Tabs */}
        <View style={styles.modeTabs}>
          <TouchableOpacity
            style={[styles.modeTab, mode === 'email' && styles.modeTabActive]}
            onPress={() => setMode('email')}
          >
            <Text style={[styles.modeTabText, mode === 'email' && styles.modeTabTextActive]}>
              🏢 Staff Login
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeTab, mode === 'enrollment' && styles.modeTabActive]}
            onPress={() => setMode('enrollment')}
          >
            <Text style={[styles.modeTabText, mode === 'enrollment' && styles.modeTabTextActive]}>
              🎓 Student Login
            </Text>
          </TouchableOpacity>
        </View>

        {/* Login Form */}
        <View style={styles.form}>
          {mode === 'email' ? (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email Address</Text>
              <TextInput
                style={styles.input}
                placeholder="admin@institute.com"
                placeholderTextColor="#9ca3af"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <Text style={styles.hint}>For admins, teachers, and parents</Text>
            </View>
          ) : (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Enrollment Number</Text>
              <TextInput
                style={[styles.input, styles.monoInput]}
                placeholder="e.g., MT-2025000"
                placeholderTextColor="#9ca3af"
                value={enrollment}
                onChangeText={setEnrollment}
                autoCapitalize="characters"
              />
              <Text style={styles.hint}>
                Enter your enrollment number provided by the institute
              </Text>
            </View>
          )}

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordContainer}>
              <TextInput
                style={[styles.input, styles.passwordInput]}
                placeholder="••••••••"
                placeholderTextColor="#9ca3af"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowPassword(!showPassword)}
              >
                <Text style={styles.eyeIcon}>{showPassword ? '👁️' : '👁️‍🗨️'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.loginButton, loading && styles.loginButtonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.loginButtonText}>
                {mode === 'enrollment' ? '🎓 Sign In as Student' : '🏢 Sign In'}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Help Hint */}
        <View style={styles.helpBox}>
          <Text style={styles.helpText}>
            {mode === 'enrollment'
              ? 'Contact your institute admin if you don\'t have your login credentials.'
              : 'New here? Contact your institute for account setup.'}
          </Text>
        </View>

        <Text style={styles.footer}>
          Powered by{' '}
          <Text style={styles.footerBold}>Maheshwari Tech</Text>
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginTop: 40,
    marginBottom: 32,
  },
  logoContainer: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: '#eef2ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e0e7ff',
  },
  logoIcon: {
    fontSize: 36,
  },
  appTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  appSubtitle: {
    fontSize: 14,
    color: '#6b7280',
  },
  modeTabs: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
    padding: 3,
    marginBottom: 24,
  },
  modeTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  modeTabActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  modeTabText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6b7280',
  },
  modeTabTextActive: {
    color: '#111827',
  },
  form: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111827',
  },
  monoInput: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  hint: {
    fontSize: 11,
    color: '#9ca3af',
    marginTop: 6,
  },
  passwordContainer: {
    position: 'relative',
  },
  passwordInput: {
    paddingRight: 50,
  },
  eyeButton: {
    position: 'absolute',
    right: 14,
    top: 12,
    padding: 4,
  },
  eyeIcon: {
    fontSize: 18,
  },
  loginButton: {
    backgroundColor: '#6366f1',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  loginButtonDisabled: {
    opacity: 0.7,
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  helpBox: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#f3f4f6',
  },
  helpText: {
    fontSize: 13,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 18,
  },
  footer: {
    textAlign: 'center',
    fontSize: 12,
    color: '#9ca3af',
  },
  footerBold: {
    fontWeight: '700',
    color: '#111827',
  },
});
