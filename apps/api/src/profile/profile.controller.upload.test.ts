import { Test } from '@nestjs/testing';
import type { ExecutionContext, INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ProfileController } from './profile.controller';
import { PhotoService } from './photo.service';
import { BiodataService } from './biodata.service';
import { ProfileService } from './profile.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

/**
 * The website's upload routes, exercised over HTTP.
 *
 * These exist because a browser cannot PUT to the bucket: that request is
 * cross-origin and needs a bucket CORS rule this deployment cannot write, so the
 * bytes come to the API instead. The part worth proving here is that the body
 * actually arrives — Nest's adapter parses JSON and form bodies only, which is
 * what leaves the raw stream available, and that is an assumption about the
 * framework rather than something the unit tests can see. The services are
 * stubs, so what is checked is routing, the query contract and the bytes handed
 * to the service.
 */
describe('upload content routes', () => {
  let app: INestApplication;
  const photos = { uploadBytes: jest.fn(async () => undefined) };
  const biodata = { uploadBytes: jest.fn(async () => undefined) };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ProfileController],
      providers: [
        { provide: ProfileService, useValue: {} },
        { provide: PhotoService, useValue: photos },
        { provide: BiodataService, useValue: biodata },
      ],
    })
      // The routes are authenticated for real; this is about the body, so the
      // guard is replaced by one that only attaches the claims.
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest().auth = { sub: 'u1' };
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('hands the photo bytes to the service under the caller', async () => {
    const bytes = Buffer.alloc(10, 7);

    await request(app.getHttpServer())
      .put('/profile/photos/content?object_key=profiles/p1/abc')
      .set('Content-Type', 'image/jpeg')
      .send(bytes)
      .expect(204);

    const [call] = photos.uploadBytes.mock.calls as unknown as [string, string, Buffer, string][];
    expect(call?.[0]).toBe('u1');
    expect(call?.[1]).toBe('profiles/p1/abc');
    expect(Buffer.isBuffer(call?.[2])).toBe(true);
    expect(call?.[2].equals(bytes)).toBe(true);
    expect(call?.[3]).toBe('image/jpeg');
  });

  it('accepts a content type that carries a parameter', async () => {
    await request(app.getHttpServer())
      .put('/profile/photos/content?object_key=profiles/p1/abc')
      .set('Content-Type', 'image/png; charset=binary')
      .send(Buffer.alloc(4, 1))
      .expect(204);

    const [, , , mime] = photos.uploadBytes.mock.calls[0] as unknown as string[];
    expect(mime).toBe('image/png');
  });

  it('hands a text document to the biodata service', async () => {
    const bytes = Buffer.from('Name: Asha Rao\nGender: Female', 'utf8');

    await request(app.getHttpServer())
      .put('/profile/biodata/content?object_key=biodata/p1/doc.txt')
      .set('Content-Type', 'text/plain')
      .send(bytes)
      .expect(204);

    const [call] = biodata.uploadBytes.mock.calls as unknown as [string, string, Buffer, string][];
    expect(call?.[1]).toBe('biodata/p1/doc.txt');
    expect(call?.[2].toString('utf8')).toBe('Name: Asha Rao\nGender: Female');
    expect(call?.[3]).toBe('text/plain');
  });

  it('refuses a request with no object key', async () => {
    await request(app.getHttpServer())
      .put('/profile/photos/content')
      .set('Content-Type', 'image/jpeg')
      .send(Buffer.alloc(4, 1))
      .expect(400);

    expect(photos.uploadBytes).not.toHaveBeenCalled();
  });

  it('refuses a photo larger than the cap before calling the service', async () => {
    await request(app.getHttpServer())
      .put('/profile/photos/content?object_key=profiles/p1/abc')
      .set('Content-Type', 'image/jpeg')
      .send(Buffer.alloc(5 * 1024 * 1024 + 1, 1))
      .expect(413);

    expect(photos.uploadBytes).not.toHaveBeenCalled();
  });
});
