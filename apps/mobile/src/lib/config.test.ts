// `expo-constants` reaches for native modules that do not exist under jest; the
// resolver itself takes its inputs as arguments, so the module only has to exist.
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { extra: {} } } }));

import { resolveApiBaseUrl } from './config';

/**
 * Which API the app talks to.
 *
 * `app.json` pins the deployed API, so if it outranked the environment variable
 * there was no way to build the app against a local or staging API at all —
 * which is exactly the wall a local run hit.
 */
describe('resolveApiBaseUrl', () => {
  it('lets the environment override app.json', () => {
    expect(resolveApiBaseUrl('http://localhost:8090/api/v1', 'https://prod.example/api/v1')).toBe(
      'http://localhost:8090/api/v1',
    );
  });

  it('falls back to app.json when the environment says nothing', () => {
    expect(resolveApiBaseUrl(undefined, 'https://prod.example/api/v1')).toBe(
      'https://prod.example/api/v1',
    );
  });

  it('treats an empty variable as unset rather than as an empty URL', () => {
    expect(resolveApiBaseUrl('', 'https://prod.example/api/v1')).toBe(
      'https://prod.example/api/v1',
    );
  });

  it('falls back to localhost when neither is configured', () => {
    expect(resolveApiBaseUrl(undefined, undefined)).toBe('http://localhost:4000/api/v1');
  });

  it('strips trailing slashes so path joins never double up', () => {
    expect(resolveApiBaseUrl('http://localhost:8090/api/v1//', undefined)).toBe(
      'http://localhost:8090/api/v1',
    );
  });
});
