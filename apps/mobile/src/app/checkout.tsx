import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import type { PaymentStatusResponse } from '@matrimony/shared';
import { AppShell } from '../components/AppShell';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenHeader } from '../components/ScreenHeader';
import { apiClient } from '../lib/api-client';
import { useAuth } from '../lib/auth-context';
import { colors, spacing, typography } from '../theme/tokens';

/**
 * How long to wait for the gateway's webhook before telling the user the
 * payment is still settling. The unlock is written by the webhook, never by the
 * client, so after checkout returns there is a real gap that polling bridges.
 */
const POLL_INTERVAL_MS = 2_000;
const MAX_POLLS = 12;

type Phase = 'checkout' | 'verifying' | 'confirmed' | 'pending' | 'failed';

/**
 * Razorpay checkout, hosted in a WebView.
 *
 * The order is created by the API (`POST /payments/unlocks`) and handed here
 * with the publishable `key_id`; this screen never sees the secret and never
 * decides that a payment succeeded. Its only job is to open checkout, then poll
 * the server until it reports the unlock — the server, fed by the signed
 * webhook, is the sole authority (section 40).
 */
export default function CheckoutScreen() {
  const params = useLocalSearchParams<{
    payment_id?: string;
    order_id?: string;
    key_id?: string;
    amount_minor?: string;
    name?: string;
    profile_id?: string;
  }>();
  const { token } = useAuth();
  const insets = useSafeAreaInsets();

  const paymentId = params.payment_id;
  const orderId = params.order_id;
  const keyId = params.key_id;
  const amountMinor = params.amount_minor ? Number(params.amount_minor) : NaN;
  const profileId = params.profile_id;

  const [phase, setPhase] = useState<Phase>('checkout');
  const [message, setMessage] = useState<string | null>(null);

  const missing = !paymentId || !orderId || !keyId || !Number.isFinite(amountMinor);

  const html = useMemo(() => {
    if (missing) return '';
    return checkoutHtml({
      keyId: keyId as string,
      orderId: orderId as string,
      amountMinor,
      description: params.name ? `Unlock contact with ${params.name}` : 'Unlock contact',
    });
  }, [missing, keyId, orderId, amountMinor, params.name]);

  const goToProfile = useCallback(() => {
    if (!profileId) {
      router.back();
      return;
    }
    // The member screen reloads on focus, so returning here shows the now
    // unlocked contact without a manual refresh.
    router.replace({ pathname: '/member/[id]', params: { id: profileId } });
  }, [profileId]);

  /** Poll the server until it confirms the unlock, fails, or time runs out. */
  const verify = useCallback(async () => {
    if (!token || !paymentId) return;
    setPhase('verifying');
    setMessage(null);
    for (let attempt = 0; attempt < MAX_POLLS; attempt += 1) {
      let status: PaymentStatusResponse;
      try {
        status = await apiClient.getPaymentStatus(paymentId, token);
      } catch (e) {
        setPhase('failed');
        setMessage(e instanceof Error ? e.message : 'Could not confirm the payment.');
        return;
      }
      if (status.status === 'SUCCESS') {
        setPhase('confirmed');
        return;
      }
      if (status.status === 'FAILED' || status.status === 'CANCELLED') {
        setPhase('failed');
        setMessage('The payment did not go through.');
        return;
      }
      await delay(POLL_INTERVAL_MS);
    }
    // Paid at the gateway but the confirmation has not landed yet; the unlock
    // will appear once the webhook is processed, so this is not an error.
    setPhase('pending');
    setMessage('Payment received. Confirmation is taking longer than usual.');
  }, [token, paymentId]);

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let payload: { type?: string; message?: string };
      try {
        payload = JSON.parse(event.nativeEvent.data) as typeof payload;
      } catch {
        return;
      }
      if (payload.type === 'success') {
        void verify();
      } else if (payload.type === 'failed') {
        setPhase('failed');
        setMessage(payload.message ?? 'The payment failed.');
      } else if (payload.type === 'dismissed') {
        setPhase('failed');
        setMessage('Checkout was closed before payment.');
      }
    },
    [verify],
  );

  useEffect(() => {
    if (missing) {
      setPhase('failed');
      setMessage('This payment session is incomplete. Please start again.');
    }
  }, [missing]);

  return (
    <AppShell>
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <ScreenHeader title="Unlock contact" onBack={() => router.back()} />
        {phase === 'checkout' && !missing ? (
          <WebView
            originWhitelist={['*']}
            source={{ html }}
            onMessage={onMessage}
            style={styles.web}
            onError={() => {
              setPhase('failed');
              setMessage('Could not open the payment page.');
            }}
          />
        ) : (
          <View style={styles.body}>
            {phase === 'verifying' ? (
              <>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.text}>Confirming your payment…</Text>
              </>
            ) : null}
            {phase === 'confirmed' ? (
              <>
                <Text style={styles.heading}>Contact unlocked</Text>
                <Text style={styles.text}>This member's details are now visible to you.</Text>
              </>
            ) : null}
            {phase === 'pending' ? (
              <>
                <Text style={styles.heading}>Almost there</Text>
                <Text style={styles.text}>{message}</Text>
              </>
            ) : null}
            {phase === 'failed' ? (
              <>
                <Text style={styles.heading}>Payment not completed</Text>
                <Text style={styles.text}>{message ?? 'Please try again.'}</Text>
              </>
            ) : null}
          </View>
        )}
        {phase !== 'checkout' ? (
          <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.lg }]}>
            {phase === 'confirmed' ? (
              <PrimaryButton label="View contact" onPress={goToProfile} />
            ) : null}
            {phase === 'pending' ? (
              <PrimaryButton label="Check again" onPress={() => void verify()} />
            ) : null}
            {phase === 'failed' ? (
              <PrimaryButton label="Back to profile" onPress={goToProfile} />
            ) : null}
          </View>
        ) : null}
      </View>
    </AppShell>
  );
}

/**
 * The checkout page.
 *
 * Values are injected with `JSON.stringify` so a merchant name or description
 * containing a quote cannot break out of the string literal. Amounts are paise,
 * matching the order; the gateway ignores a mismatch in favour of the order it
 * was created with, but sending the same number keeps the display honest.
 */
function checkoutHtml(input: {
  keyId: string;
  orderId: string;
  amountMinor: number;
  description: string;
}): string {
  return `<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
    <style>
      html, body { margin: 0; height: 100%; background: ${colors.background}; }
    </style>
  </head>
  <body>
    <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
    <script>
      function post(payload) {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify(payload));
        }
      }
      try {
        var options = {
          key: ${JSON.stringify(input.keyId)},
          order_id: ${JSON.stringify(input.orderId)},
          amount: ${JSON.stringify(String(input.amountMinor))},
          currency: 'INR',
          name: 'Networth Matrimony',
          description: ${JSON.stringify(input.description)},
          theme: { color: ${JSON.stringify(colors.primary)} },
          handler: function (response) {
            post({ type: 'success', payment_id: response.razorpay_payment_id });
          },
          modal: {
            ondismiss: function () { post({ type: 'dismissed' }); }
          }
        };
        var rzp = new Razorpay(options);
        rzp.on('payment.failed', function (response) {
          var description = response && response.error && response.error.description;
          post({ type: 'failed', message: description || 'The payment failed.' });
        });
        rzp.open();
      } catch (error) {
        post({ type: 'failed', message: String((error && error.message) || error) });
      }
    </script>
  </body>
</html>`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  web: {
    flex: 1,
    backgroundColor: colors.background,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.screenX,
  },
  heading: {
    color: colors.textPrimary,
    ...typography.h1,
    textAlign: 'center',
  },
  text: {
    color: colors.textMuted,
    ...typography.body,
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: spacing.screenX,
    paddingTop: spacing.md,
  },
});
