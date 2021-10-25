const PocSamplePayload = {
  patient: "b4ddd369-bec5-446e-b8f8-47fd5567b295",
  encounter: "16989cdd-1328-4932-9ced-a16b5f23224f",
  type: "drugorder",
  dateActivated: "2018-10-16 12:08:43",
  careSetting: "INPATIENT",
  action: "new",
  urgency: "ROUTINE",
  orderer: [
    {
      uuid: "b9e0e833-5b5a-44e5-9699-01a50630584a",
      display: "testRest User: Unknown",
      provider: {
        uuid: "pd6a57ac-1359-11df-a1f1-0026b9348838",
        display: "788-0 - testRest User",
      },
    },
    {
      uuid: "01cdf32b-1ebe-4a79-8d98-77de28d8a458",
      display: "testRest User: Unknown",
      provider: {
        uuid: "pd6a57ac-1359-11df-a1f1-0026b9348838",
        display: "788-0 - testRest User",
      },
    },
  ],
  drugOrders: [
    {
      name: "DOLUTEGRAVIR 50mg",
      uuid: "60f1008a-6c6f-4f22-9131-b82c6935039c",
      display: "DOLUTEGRAVIR",
      dose: 20,
      doseUnits: "a8a07f8e-1350-11df-a1f1-0026b9348838",
      route: "db0c5937-3874-4eae-9566-9a645ad7ac65",
      frequency: "bc1369f2-6795-11e7-843e-a0d3c1fcd41c",
      quantity: 10,
      numRefills: 1,
      quantityUnits: "a8a07f8e-1350-11df-a1f1-0026b9348838",
    },
    {
      name: "3TC 300 and TDF 300",
      uuid: "a89cc876-1350-11df-a1f1-0026b9348838",
      display: "LAMIVUDINE AND TENOFOVIR",
      dose: 20,
      doseUnits: "a8a07f8e-1350-11df-a1f1-0026b9348838",
      route: "db0c5937-3874-4eae-9566-9a645ad7ac65",
      frequency: "bc1369f2-6795-11e7-843e-a0d3c1fcd41c",
      quantity: 10,
      numRefills: 1,
      quantityUnits: "a8a07f8e-1350-11df-a1f1-0026b9348838",
    },
  ],
};

export default PocSamplePayload;
