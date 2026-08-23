import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { ShrConsentSession } from '../core/database/entities/shr-consent-session.entity';
import { ShrConsentSessionStore } from './shr-consent-session.store';
import { ShrConsentSessionStatus } from './types';

const tokenWith = (claims: Record<string, unknown>) =>
  [
    Buffer.from(JSON.stringify({ alg: 'ES256', typ: 'JWT' })).toString(
      'base64url',
    ),
    Buffer.from(JSON.stringify(claims)).toString('base64url'),
    'signature',
  ].join('.');

describe('ShrConsentSessionStore', () => {
  let store: ShrConsentSessionStore;
  const repository = {
    findOne: jest.fn(),
    findOneBy: jest.fn(),
    create: jest.fn(),
    merge: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    // Stand in for TypeORM's own merge/create.
    repository.create.mockImplementation(() => ({}));
    repository.merge.mockImplementation((target, patch) =>
      Object.assign(target, patch),
    );
    repository.save.mockImplementation((entity) => Promise.resolve(entity));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShrConsentSessionStore,
        {
          provide: getRepositoryToken(ShrConsentSession),
          useValue: repository,
        },
      ],
    }).compile();

    store = module.get(ShrConsentSessionStore);
  });

  it('looks an open session up by the (crId, locationUuid) pair', async () => {
    repository.findOne.mockResolvedValue(null);

    await store.findOpenSession('CR-1', 'loc-1');

    expect(repository.findOne).toHaveBeenCalledWith({
      where: {
        crId: 'CR-1',
        locationUuid: 'loc-1',
        status: ShrConsentSessionStatus.Open,
      },
      order: { id: 'DESC' },
    });
  });

  it("stores the token's own exp claim rather than a locally invented expiry", async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    repository.findOneBy.mockResolvedValue(null);

    const saved = await store.recordIssuedToken({
      crId: 'CR-1',
      locationUuid: 'loc-1',
      visitId: 'v-1',
      consentToken: tokenWith({ exp }),
      consentId: 'c-1',
    });

    expect(saved).toMatchObject({
      crId: 'CR-1',
      locationUuid: 'loc-1',
      visitId: 'v-1',
      consentId: 'c-1',
      status: ShrConsentSessionStatus.Open,
    });
    expect(saved?.tokenExpiresAt?.getTime()).toBe(exp * 1000);
  });

  it('leaves the expiry unknown when the token carries no exp claim', async () => {
    repository.findOneBy.mockResolvedValue(null);

    const saved = await store.recordIssuedToken({
      crId: 'CR-1',
      locationUuid: 'loc-1',
      visitId: 'v-1',
      consentToken: tokenWith({ sub: 'CR-1' }),
    });

    expect(saved?.tokenExpiresAt).toBeNull();
    expect(saved?.consentId).toBeNull();
  });

  it('updates the row for a visit it already tracks instead of inserting a second one', async () => {
    const existing = {
      id: 7,
      visitId: 'v-1',
      consentId: 'c-1',
      status: ShrConsentSessionStatus.Closed,
    };
    repository.findOneBy.mockResolvedValue(existing);

    const saved = await store.recordIssuedToken({
      crId: 'CR-1',
      locationUuid: 'loc-1',
      visitId: 'v-1',
      consentToken: 'tok-2',
    });

    expect(repository.create).not.toHaveBeenCalled();
    expect(saved).toMatchObject({
      id: 7,
      // Kept from the existing row, since open-visits does not carry it.
      consentId: 'c-1',
      status: ShrConsentSessionStatus.Open,
    });
  });

  it('does nothing when refreshing a visit it does not track', async () => {
    repository.findOneBy.mockResolvedValue(null);

    expect(await store.recordRefreshedToken('v-unknown', 'tok-2')).toBeNull();
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('never lets a bookkeeping failure surface to the caller', async () => {
    repository.findOneBy.mockResolvedValue(null);
    repository.save.mockRejectedValue(new Error('deadlock'));

    // The DHA call already succeeded by this point — a failed write here must
    // not turn a granted consent into an error.
    expect(
      await store.recordIssuedToken({
        crId: 'CR-1',
        locationUuid: 'loc-1',
        visitId: 'v-1',
        consentToken: 'tok-1',
      }),
    ).toBeNull();

    repository.update.mockRejectedValue(new Error('deadlock'));
    await expect(store.markClosedByVisit('v-1')).resolves.toBeUndefined();
    await expect(store.markClosedByConsent('c-1')).resolves.toBeUndefined();
  });

  it('closes by visit and by consent', async () => {
    repository.update.mockResolvedValue({ affected: 1 });

    await store.markClosedByVisit('v-1');
    expect(repository.update).toHaveBeenCalledWith(
      { visitId: 'v-1' },
      { status: ShrConsentSessionStatus.Closed },
    );

    await store.markClosedByConsent('c-1');
    expect(repository.update).toHaveBeenCalledWith(
      { consentId: 'c-1' },
      { status: ShrConsentSessionStatus.Closed },
    );
  });
});
