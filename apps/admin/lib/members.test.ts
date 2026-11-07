import { ADMIN_USER_STATUSES } from '@matrimony/shared';
import {
  ADMIN_USER_STATUS_LABELS,
  isAdminUserStatus,
  memberStatusLabel,
  memberStatusTone,
} from './members';

describe('isAdminUserStatus', () => {
  it('accepts every lifecycle state and nothing else', () => {
    for (const status of ADMIN_USER_STATUSES) {
      expect(isAdminUserStatus(status)).toBe(true);
    }
    expect(isAdminUserStatus('PENDING')).toBe(false);
    expect(isAdminUserStatus(undefined)).toBe(false);
  });
});

describe('memberStatusLabel', () => {
  it('names what is happening rather than the enum', () => {
    expect(memberStatusLabel('PENDING_VERIFICATION')).toBe('Verifying identity');
    expect(memberStatusLabel('AWAITING_SETUP_FEE')).toBe('Setup fee due');
    expect(memberStatusLabel('ACTIVE')).toBe('Active');
  });

  it('still renders a state this build does not know', () => {
    expect(memberStatusLabel('ON_HOLD')).toBe('ON_HOLD');
  });

  it('labels every known state', () => {
    for (const status of ADMIN_USER_STATUSES) {
      expect(ADMIN_USER_STATUS_LABELS[status]).toBeTruthy();
    }
  });
});

describe('memberStatusTone', () => {
  it('marks only the states that need attention', () => {
    expect(memberStatusTone('ACTIVE')).toBe('badge-ok');
    expect(memberStatusTone('SUSPENDED')).toBe('badge-danger');
    expect(memberStatusTone('AWAITING_SETUP_FEE')).toBe('badge-open');
  });

  it('falls back to a neutral badge for an unknown state', () => {
    expect(memberStatusTone('ON_HOLD')).toBe('badge-closed');
  });
});
