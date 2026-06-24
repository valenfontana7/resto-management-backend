import {
  emailsShareIdentity,
  getEmailCanonicalIdentity,
  normalizeEmailForStorage,
} from './email-identity.util';

describe('email-identity.util', () => {
  it('normalizes storage email', () => {
    expect(normalizeEmailForStorage('  Test@Example.COM ')).toBe(
      'test@example.com',
    );
  });

  it('strips plus-tag for generic domains', () => {
    expect(getEmailCanonicalIdentity('vos+spam@gmai.bentos')).toBe(
      'vos@gmai.bentos',
    );
    expect(getEmailCanonicalIdentity('vos+18@gmai.bentos')).toBe(
      'vos@gmai.bentos',
    );
  });

  it('normalizes gmail dots and plus-tags', () => {
    expect(getEmailCanonicalIdentity('juan.peres+1@gmail.com')).toBe(
      'juanperes@gmail.com',
    );
    expect(getEmailCanonicalIdentity('juanperes@gmail.com')).toBe(
      'juanperes@gmail.com',
    );
  });

  it('detects shared identity across aliases', () => {
    expect(emailsShareIdentity('vos+1@gmai.bentos', 'vos+18@gmai.bentos')).toBe(
      true,
    );
    expect(emailsShareIdentity('real@gmail.com', 'real+tag@gmail.com')).toBe(
      true,
    );
    expect(emailsShareIdentity('real@gmail.com', 'other@gmail.com')).toBe(
      false,
    );
  });
});
