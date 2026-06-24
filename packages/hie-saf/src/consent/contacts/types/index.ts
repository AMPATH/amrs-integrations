export type PatientContactResponse = {
  count: number;
  results: Contact[];
};

export type Contact = {
  id: number;
  contactValue: string;
  contactType: string;
  isConfirmed: boolean;
  active: boolean;
};
