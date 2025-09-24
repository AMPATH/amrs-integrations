export class ConceptMapper {
  private drugQuestionsConcepts = new Set([
    "a896cc00-1350-11df-a1f1-0026b9348838",
    "a899cf5e-1350-11df-a1f1-0026b9348838",
    "a89b6a62-1350-11df-a1f1-0026b9348838",
    "a8a318e8-1350-11df-a1f1-0026b9348838",
    "a899e282-1350-11df-a1f1-0026b9348838",
    "a89b82cc-1350-11df-a1f1-0026b9348838",
    "a899e35e-1350-11df-a1f1-0026b9348838",
    "a89b83bc-1350-11df-a1f1-0026b9348838",
    "a899e444-1350-11df-a1f1-0026b9348838",
    "a89c218c-1350-11df-a1f1-0026b9348838",
    "a899e516-1350-11df-a1f1-0026b9348838",
    "a89c286c-1350-11df-a1f1-0026b9348838",
    "d88dd806-5db1-49c0-a72e-8437fa718022",
    "87f971b1-1537-417e-99bc-e18ab7f480ce",
    "a8a060c6-1350-11df-a1f1-0026b9348838",
  ]);

  private clinicalNoteConcepts = new Set([
    "23f710cc-7f9c-4255-9b6b-c3e240215dba",
  ]);

  isDrugObservation(observation: any): boolean {
    const codeCoding = observation.code?.coding || [];
    const valueCoding = observation.valueCodeableConcept?.coding || [];

    const allCodings = [...codeCoding, ...valueCoding];
    return allCodings.some((code: any) =>
      this.drugQuestionsConcepts.has(code.code)
    );
  }

  isClinicalNote(observation: any): boolean {
    const coding = observation.code?.coding || [];
    return coding.some((code: any) => this.clinicalNoteConcepts.has(code.code));
  }

  getObservationType(observation: any): "drug" | "clinical-note" | "regular" {
    if (this.isDrugObservation(observation)) return "drug";
    if (this.isClinicalNote(observation)) return "clinical-note";
    return "regular";
  }
}
