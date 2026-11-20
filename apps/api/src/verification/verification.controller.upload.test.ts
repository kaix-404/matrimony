import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { VerificationController } from './verification.controller';
import { VerificationService } from './verification.service';
import { VerificationGateway } from './verification.gateway';
import { TokenService } from '../auth/token.service';

/**
 * The manual document routes, over HTTP.
 *
 * Two things are worth proving here and neither is visible to a unit test: that
 * the guard is attached to these routes (an upload that needs no session would
 * let anyone fill the bucket and the review queue), and that the bytes actually
 * arrive — the service is a stub, so what is checked is routing, the query
 * contract and the body handed over.
 */
describe('manual document routes', () => {
  let app: INestApplication;
  const verification = { uploadManualBytes: jest.fn(async () => undefined) };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [VerificationController],
      providers: [
        { provide: VerificationService, useValue: verification },
        { provide: VerificationGateway, useValue: { configured: false } },
        // The real guard, with only the token check stubbed: a missing bearer is
        // then answered by the guard itself rather than by a test double.
        {
          provide: TokenService,
          useValue: {
            verifyAccessToken: async (token: string) => (token === 'good' ? { sub: 'u1' } : null),
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('requires a session', async () => {
    await request(app.getHttpServer())
      .put('/verification/manual/content?object_key=verification/u1/doc.jpg')
      .set('Content-Type', 'image/jpeg')
      .send(Buffer.alloc(4, 1))
      .expect(401);

    expect(verification.uploadManualBytes).not.toHaveBeenCalled();
  });

  it('hands the document bytes to the service under the caller', async () => {
    const bytes = Buffer.alloc(6, 3);

    await request(app.getHttpServer())
      .put('/verification/manual/content?object_key=verification/u1/doc.jpg')
      .set('Authorization', 'Bearer good')
      .set('Content-Type', 'image/jpeg')
      .send(bytes)
      .expect(204);

    const [call] = verification.uploadManualBytes.mock.calls as unknown as [
      string,
      string,
      Buffer,
      string,
    ][];
    expect(call?.[0]).toBe('u1');
    expect(call?.[1]).toBe('verification/u1/doc.jpg');
    expect(call?.[2].equals(bytes)).toBe(true);
    expect(call?.[3]).toBe('image/jpeg');
  });

  it('refuses a request with no object key', async () => {
    await request(app.getHttpServer())
      .put('/verification/manual/content')
      .set('Authorization', 'Bearer good')
      .set('Content-Type', 'image/jpeg')
      .send(Buffer.alloc(4, 1))
      .expect(400);

    expect(verification.uploadManualBytes).not.toHaveBeenCalled();
  });
});
