export type Intervention = {
  id: number;
  accessPoint: string;
  name: string;
  code: string;
  paymentMechanism: string;
  needsPreauth: boolean;
  needsManualPreauthApproval: boolean;
  overallTariff: string;
  kephLevelTarriff: string;
  fund: string;
  fallBackOverallTariff: string;
  numberOfDoctorsRequired: number;
  tariffPerAdditionalKilometer: string;
  level2Tariff: string;
  level3Tariff: string;
  level4Tariff: string;
  level5Tariff: string;
  level6Tariff: string;
  requiresSurgicalPreauth: boolean;
  requiresRenalPreauth: boolean;
  requiresOncologyPreauth: boolean;
  requiresRadiologyPreauth: boolean;
  requiresOpticalPreauth: boolean;
  applicableSchemes: string[];
};

export type InterventionsApiResponse = {
  count: number;
  pageSize: number;
  currentPage: number;
  totalPages: number;
  startIndex: number;
  endIndex: number;
  results: Intervention[];
};
