import { ClaimVisit } from '../../../../core/database/entities/claim-visit.entity';

export type QueryClaimVisitDto = Pick<ClaimVisit, 'authorizationCode'>;
