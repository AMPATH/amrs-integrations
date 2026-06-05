export type OpenMRSSessionResponse = {
  authenticated: boolean;
  user: {
    uuid: string;
    display: string;
  };
};
