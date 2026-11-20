/**
 * Gateway tests.
 *
 * The signature check is the only thing standing between a stranger with a
 * URL and the ability to mint unlocks for free, so it is tested against known
 * vectors rather than against the implementation's own output: a signature this
 * file computes independently must verify, and every near-miss must not.
 */

import { RazorpayPaymentGateway, rupeesToMinor, toGatewayPayment } from './payment.gateway';
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

describe('RazorpayPaymentGateway.configured', () => {
  it('is configured only with both halves of the key pair', () => {
    expect(new RazorpayPaymentGateway('key_id', 'key_secret', SECRET).configured).toBe(true);
    expect(new RazorpayPaymentGateway('key_id', '', SECRET).configured).toBe(false);
    expect(new RazorpayPaymentGateway('', 'key_secret', SECRET).configured).toBe(false);
    expect(new RazorpayPaymentGateway('   ', 'key_secret', SECRET).configured).toBe(false);
  });

  it('tracks the webhook secret separately from the key pair', () => {
    // Readiness reports these as two answers, because a deployment with keys and
    // no webhook secret can charge a member and never grant the unlock.
    const noWebhook = new RazorpayPaymentGateway('key_id', 'key_secret', '');
    expect(noWebhook.configured).toBe(true);
    expect(noWebhook.webhookConfigured).toBe(false);

    const complete = new RazorpayPaymentGateway('key_id', 'key_secret', SECRET);
    expect(complete.webhookConfigured).toBe(true);
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

describe('toGatewayPayment', () => {
  it('reduces a captured payment to the fields a settlement decision needs', () => {
    expect(
      toGatewayPayment({
        id: 'pay_1',
        status: 'captured',
        amount: 11682,
        currency: 'INR',
        method: 'upi',
        order_id: 'order_1',
      }),
    ).toMatchObject({
      gatewayPaymentId: 'pay_1',
      status: 'captured',
      amountMinor: 11682,
      currency: 'INR',
      method: 'upi',
    });
  });

  it('rejects an object whose amount is not a whole number of paise', () => {
    // Coercing this to 0 would fail the snapshot comparison and mark a real
    // capture FAILED; skipping it leaves the row pending for a human instead.
    expect(
      toGatewayPayment({ id: 'pay_1', status: 'captured', amount: 'a lot', currency: 'INR' }),
    ).toBeNull();
    expect(
      toGatewayPayment({ id: 'pay_1', status: 'captured', amount: 116.82, currency: 'INR' }),
    ).toBeNull();
  });

  it('rejects anything missing an identity, a status or a currency', () => {
    expect(toGatewayPayment(null)).toBeNull();
    expect(toGatewayPayment('pay_1')).toBeNull();
    expect(toGatewayPayment({ status: 'captured', amount: 1, currency: 'INR' })).toBeNull();
    expect(toGatewayPayment({ id: 'pay_1', amount: 1, currency: 'INR' })).toBeNull();
    expect(toGatewayPayment({ id: 'pay_1', status: 'captured', amount: 1 })).toBeNull();
  });
});

describe('RazorpayPaymentGateway.fetchOrderPayments', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    (globalThis as unknown as { fetch: unknown }).fetch = originalFetch;
  });

  function setFetch(fn: unknown): void {
    (globalThis as unknown as { fetch: unknown }).fetch = fn;
  }

  function gateway(): RazorpayPaymentGateway {
    return new RazorpayPaymentGateway('key_id', 'key_secret', SECRET);
  }

  it("reads the order's payments with the key pair, and maps what it finds", async () => {
    const fetchMock = jest.fn(async () => ({
      ok: true,
      status: 200,
      text: async (): Promise<string> =>
        JSON.stringify({
          entity: 'collection',
          count: 1,
          items: [
            {
              id: 'pay_1',
              status: 'captured',
              amount: 11682,
              currency: 'INR',
              method: 'upi',
              order_id: 'order_1',
            },
          ],
        }),
    }));
    setFetch(fetchMock);

    const payments = await gateway().fetchOrderPayments('order_1');

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.razorpay.com/v1/orders/order_1/payments');
    expect(init.method).toBe('GET');
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe(
      `Basic ${Buffer.from('key_id:key_secret').toString('base64')}`,
    );
    // A read with no ceiling is the thing this test exists for: a provider that
    // accepts the connection and never answers must not hold the sweep.
    expect(init.signal).toBeInstanceOf(AbortSignal);

    expect(payments).toEqual([
      expect.objectContaining({
        gatewayPaymentId: 'pay_1',
        status: 'captured',
        amountMinor: 11682,
        currency: 'INR',
        method: 'upi',
      }),
    ]);
  });

  it('returns nothing for an order with no attempts', async () => {
    setFetch(async () => ({
      ok: true,
      status: 200,
      text: async (): Promise<string> =>
        JSON.stringify({ entity: 'collection', count: 0, items: [] }),
    }));

    await expect(gateway().fetchOrderPayments('order_1')).resolves.toEqual([]);
  });

  it('drops an attempt whose amount cannot be compared', async () => {
    setFetch(async () => ({
      ok: true,
      status: 200,
      text: async (): Promise<string> =>
        JSON.stringify({
          items: [
            { id: 'pay_1', status: 'captured', amount: 11682, currency: 'INR' },
            { id: 'pay_2', status: 'captured', amount: 'a lot', currency: 'INR' },
          ],
        }),
    }));

    const payments = await gateway().fetchOrderPayments('order_1');

    expect(payments.map((p) => p.gatewayPaymentId)).toEqual(['pay_1']);
  });

  it('surfaces a refused read with the vendor diagnostic', async () => {
    setFetch(async () => ({
      ok: false,
      status: 401,
      text: async (): Promise<string> => '{"error":{"description":"Authentication failed"}}',
    }));

    await expect(gateway().fetchOrderPayments('order_1')).rejects.toThrow(/HTTP 401/);
  });

  it('reports a hung read as a timeout instead of waiting on it', async () => {
    setFetch(async () => {
      throw Object.assign(new Error('The operation was aborted due to timeout'), {
        name: 'TimeoutError',
      });
    });

    await expect(gateway().fetchOrderPayments('order_1')).rejects.toThrow(
      /timed out after 10 s \(order order_1\)/,
    );
  });

  it('reports a stall after the headers as the same timeout', async () => {
    // Razorpay can answer 200 and then stop sending the body. The deadline is on
    // the signal, so the rejection arrives from response.text(); it must not
    // surface as a bare DOMException.
    setFetch(async () => ({
      ok: true,
      status: 200,
      text: async (): Promise<string> => {
        throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
      },
    }));

    await expect(gateway().fetchOrderPayments('order_1')).rejects.toThrow(
      /^Razorpay order payments read timed out after 10 s \(order order_1\)$/,
    );
  });

  it('refuses to call the vendor when it is not configured', async () => {
    const fetchMock = jest.fn();
    setFetch(fetchMock);

    await expect(
      new RazorpayPaymentGateway('', '', SECRET).fetchOrderPayments('order_1'),
    ).rejects.toThrow(/not configured/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
