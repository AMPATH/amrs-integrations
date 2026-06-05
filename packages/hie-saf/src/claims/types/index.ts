export type SubBenefit = {
  id: number;
  code: string;
  name: string;
  accessPoint: string;
  fund: string;
  parentBenefit: string;
  parentBenefitCode: string;
};
export type SubBenefitsResponse = {
  count: number;
  pageSize: number;
  currentPage: number;
  totalPages: number;
  startIndex: number;
  endIndex: number;
  results: SubBenefit[];
};
