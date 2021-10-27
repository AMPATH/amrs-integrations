const DrugConcepts = [
  {
    concept: "18e86e1f-92b8-40cd-8266-0df0ab0a4a50",
    label: "DTG50mg/3TC300mg/TDF300mg",
  },
  {
    concept: "b58a28d2-36de-11e0-93be-0026b9348838",
    label: "ABC 60mg/3TC 30mg",
  },
  {
    concept: "e4ef489e-0ff1-4876-aab6-0d198cadb6b1",
    label: "ABC 120mg/3TC 60mg",
  },
  {
    concept: "e78843da-fdb6-446d-8e99-873c278b3540",
    label: "ABC 600mg/3TC 300mg",
  },
  {
    concept: "ea501f4e-cbc5-4942-b9c8-0ac415929f08",
    label: "TDF300mg/3TC300mg/EFV400mg",
  },
  {
    concept: "25c753d8-870f-11e0-85d3-000d6014b64c",
    label: "ZDV 60mg/3TC 30mg",
  },
  {
    concept: "20185c04-9334-11df-8193-000d6014b64c",
    label: "ZDV 60mg/3TC 30mg/NVP 50mg",
  },
  {
    concept: "8ddf2f66-9333-11df-8193-000d6014b64c",
    label: "ZDV 300mg/3TC 150mg/NVP 200mg >25kgs",
  },
  {
    concept: "fd4cd670-3115-11e0-8090-0026b9348838",
    label: "3TC 150mg/ZDV 300mg >25kgs",
  },
  {
    concept: "b9da84e8-3127-11e0-8090-0026b9348838",
    label: "3TC 300mg/TDF 300mg >25kgs",
  },
  {
    concept: "e0037172-87ce-11e0-85d3-000d6014b64c",
    label: "TDF 300mg/3TC 300mg/EFV 600mg >35kgs",
  },
  {
    concept: "f8b6299e-6bbf-446a-b3f1-a88f5d6b9da2",
    label: "Lopinavir 80mg/Ritonavir 20mg",
  },
  {
    concept: "ddefd319-fb5d-4c0e-a125-ff7bdb6fe44f",
    label: "Lopinavir 40mg/Ritonavir 10mg",
  },
  {
    concept: "fa8266f6-36df-11e0-93be-0026b9348838",
    label: "Lopinavir 200mg/Ritonavir 50mg",
  },
  {
    concept: "3115e231-1077-4488-a7d5-83167263b9a2",
    label: "Lopinavir 100mg/Ritonavir 25mg",
  },
  {
    concept: "3cbfb0b9-721e-4d42-92a3-7d37269aab24",
    label: " Atazanavir 300mg/ritonavir 100mg",
  },
  {
    concept: "a8afcf84-1350-11df-a1f1-0026b9348838",
    label: "Emtri200mg/TDF300(Truvada)",
  },
  {
    concept: "2fc1f68c-9939-44d4-b5f4-e064ed4073ca",
    label: "Nevirapine 100mg",
  },
  {
    concept: "0485075a-3111-11e0-8090-0026b9348838",
    label: "Nevirapine 200mg",
  },
  {
    concept: "db3c194b-3e1b-4001-9a1c-a5df1728fc28",
    label: "Efavirenz 200mg",
  },
  {
    concept: "ff9096b6-d86c-403a-9bda-eab02252dbf3",
    label: "Efavirenz 250mg",
  },
  {
    concept: "492de98c-86c6-4fd8-af89-325448f12ed9",
    label: "Efavirenz 300mg",
  },
  {
    concept: "55e0461f-b28f-42de-a3c6-328d7f17c44b",
    label: "Efavirenz 350mg",
  },
  {
    concept: "81a41a82-fd72-4da4-8d47-edd5672549ce",
    label: "Efavirenz 400mg",
  },
  {
    concept: "4677ad3e-3120-11e0-8090-0026b9348838",
    label: "Efavirenz 600mg",
  },
  {
    concept: "d6262526-3113-11e0-8090-0026b9348838",
    label: "Lamivudine 150mg",
  },
  {
    concept: "52441ef8-3126-11e0-8090-0026b9348838",
    label: " Abacavir 300mg",
  },
  {
    concept: "21d417bc-3114-11e0-8090-0026b9348838",
    label: " Zidovudine 300mg ",
  },
  {
    concept: "1baf254e-1429-4fd9-8db1-edf6523cea13",
    label: " Ritonavir 100mg",
  },
  {
    concept: "42ef7c4d-d6fb-49c0-a46e-019c42dea203",
    label: " Ritonavir 80mg",
  },
  {
    concept: "67f62fd8-d43e-4c62-a18a-e8bb5a46fc5c",
    label: " Raltegravir 25mg",
  },
  {
    concept: "c2c66e99-1345-4fdb-b101-89b2e43d40e5",
    label: " Raltegravir 100mg",
  },
  {
    concept: "da698164-870d-11e0-85d3-000d6014b64c",
    label: " Raltegravir 400mg",
  },
  {
    concept: "a8afbf9e-1350-11df-a1f1-0026b9348838",
    label: "Atazanavir",
  },
  {
    concept: "38fbba9c-4b26-412d-9659-8dd649514d66",
    label: "Etravirine 100mg",
  },
  {
    concept: "687d2b97-3336-4843-946e-597a31380746",
    label: "Darunavir 75mg",
  },
  {
    concept: "9732900a-4b81-4522-af1c-7d25ae6aad0a",
    label: "Darunavir 150mg",
  },
  {
    concept: "68a0a5dd-1e91-43a2-8dce-c6e84a14de04",
    label: "Darunavir 600mg",
  },
  {
    concept: "98b0baf6-0b73-4429-9264-6233684b0969",
    label: "Dolutegravir 50mg",
  },
  {
    concept: "644f1d3a-1c22-433a-a437-0fb4110721ce",
    label: "Dolutegravir 10mg",
  },
];

export default DrugConcepts;
