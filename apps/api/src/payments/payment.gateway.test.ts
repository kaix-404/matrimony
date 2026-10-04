/**
 * Gateway tests.
 *
 * The signature check is the only thing standing between a stranger with a
 * URL and the ability to mint unlocks for free, so it is tested against known
 * vectors rather than against the implementation's own output: a signature this
 * file computes independently must verify, and every near-miss must not.
 */

import { RazorpayPaymentGateway, rupeesToMinor } from './payment.gateway';
import { createHmac } from 'node:crypto';

const SECRET = 'whsec_test_2f8a41d6e0b74c9fb31a7d5e8c0a4b6d';

describe('rupeesToMinor', () => {
  it('converts rupees to paise exactly', () => {
    expect(rupeesToMinor('116.82')).toBe(11682);
    expect(rupeesToMinor('99.00')).toBe(9900);
    expect(rupeesToMinor('17.70')).toBe(1770);
    expect(rupeesToMinor('0.01')).toBe(1);
    expect(rupeesToMinor('999.00')).toBe(99900);
  });

  it('accepts a number without going through binary floating point', () => {
    // 0.1 + 0.2 style drift: the naive arithmetic would give 11681.99999...
    expect(rupeesToMinor(116.82)).toBe(11682);
  });

  it('rejects a sub-paise amount rather than rounding it', () => {
    // Rounding here would mean charging a different amount than the one the
    // server snapshotted, which is exactly what section 40 forbids.
    expect(() => rupeesToMinor('10.005')).toThrow(/sub-paise/);
  });
});

describe('RazorpayPaymentGateway.verifyWebhookSignature', () => {
  const gateway = new RazorpayPaymentGateway('key_id', 'key_secret', SECRET);

  /** Computed independently of the implementation under test. */
  const sign = (body: string, secret = SECRET) =>
    createHmac('sha256', secret).update(`${body}|${secret}`).digest('hex');

  it('accepts a signature produced over the raw body', () => {
    const body = JSON.stringify({
      event: 'payment.captured',
      payload: { entity: { id: 'pay_1' } },
    });
    expect(gateway.verifyWebhookSignature(body, sign(body))).toBe(true);
  });

  it('rejects a body altered after signing', () => {
    const body = '{"event":"payment.captured"}';
    const tampered = '{"event":"payment.failed"}';
    expect(gateway.verifyWebhookSignature(tampered, sign(body))).toBe(false);
  });

  it('rejects a signature computed with the wrong secret', () => {
    const body = '{"event":"payment.captured"}';
    expect(gateway.verifyWebhookSignature(body, sign(body, 'whsec_attacker'))).toBe(false);
  });

  it('rejects a missing signature', () => {
    expect(gateway.verifyWebhookSignature('{}', undefined)).toBe(false);
    expect(gateway.verifyWebhookSignature('{}', '')).toBe(false);
  });

  it('rejects a signature of the wrong length instead of throwing', () => {
    // timingSafeEqual throws on a length mismatch; an unguarded call would turn
    // a malformed delivery into a 500 and a gateway retry storm.
    expect(gateway.verifyWebhookSignature('{}', 'abc')).toBe(false);
  });

  it('fails closed when no webhook secret is configured', () => {
    const unconfigured = new RazorpayPaymentGateway('key_id', 'key_secret', '');
    const body = '{"event":"payment.captured"}';
    // Even a correctly-shaped signature must be refused: with no secret there
    // is nothing to verify against, and defaulting to "accept" would make an
    // unconfigured deployment accept forged payments.
    expect(unconfigured.verifyWebhookSignature(body, sign(body, ''))).toBe(false);
  });
});
