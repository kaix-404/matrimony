import { RegisterDeviceTokenSchema, DeviceTokenResponseSchema } from './devices.js';

/**
 * The device-registration contract (section 42). The mobile app depends on
 * these shapes, so they are pinned here: a token is opaque and long, the
 * platform is a closed set, and an unknown field is rejected rather than
 * silently dropped — a client sending `platform: "android"` should learn the
 * enum is upper-case rather than have token registration quietly no-op.
 */
describe('RegisterDeviceTokenSchema', () => {
  it('accepts a token, a known platform and an optional device id', () => {
    expect(
      RegisterDeviceTokenSchema.parse({ token: 'abc:123', platform: 'ANDROID' }),
    ).toEqual({ token: 'abc:123', platform: 'ANDROID' });
    expect(
      RegisterDeviceTokenSchema.parse({
        token: 'abc:123',
        platform: 'IOS',
        device_id: 'install-1',
      }).device_id,
    ).toBe('install-1');
  });

  it('rejects an unknown platform and a missing token', () => {
    expect(RegisterDeviceTokenSchema.safeParse({ token: 't', platform: 'WINDOWS' }).success).toBe(
      false,
    );
    expect(RegisterDeviceTokenSchema.safeParse({ platform: 'WEB' }).success).toBe(false);
  });

  it('rejects an unknown field rather than dropping it', () => {
    expect(
      RegisterDeviceTokenSchema.safeParse({ token: 't', platform: 'WEB', fcm: 'legacy' }).success,
    ).toBe(false);
  });
});

describe('DeviceTokenResponseSchema', () => {
  it('parses a registered device without a token field', () => {
    const row = {
      id: 'clx0000000000000000000000',
      platform: 'ANDROID',
      device_id: null,
      last_seen_at: new Date('2026-10-14T00:00:00.000Z'),
      created_at: new Date('2026-10-14T00:00:00.000Z'),
    };
    expect(DeviceTokenResponseSchema.parse(row)).toEqual(row);
  });
});
