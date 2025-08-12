import { HiePatient } from "../../types/hie.type";
import config from "../../config/env";

export class PatientMapper {
  static hieToAmrs(hiePatient: HiePatient): any {
    return {
      person: {
        names: [
          {
            givenName: hiePatient.name[0].given.join(" "),
            familyName: hiePatient.name[0].family,
            preferred: true,
          },
        ],
        gender: hiePatient.gender.substring(0, 1).toUpperCase(),
        birthdate: new Date(hiePatient.birthDate).toISOString(),
        addresses: [
          {
            address1: hiePatient.address?.[0]?.city || "",
            country: hiePatient.address?.[0]?.country || "Kenya",
          },
        ],
        attributes: this.extractAttributes(hiePatient),
      },
      identifiers: this.extractIdentifiers(hiePatient),
    };
  }

  private static extractIdentifiers(hiePatient: HiePatient): any[] {
    const identifiers = [];

    for (const id of hiePatient.identifier) {
      const typeCode = id.type.coding[0].code;

      if (typeCode === "national-id") {
        identifiers.push({
          identifier: id.value,
          identifierType: config.AMRS.NATIONAL_ID_TYPE_UUID,
          preferred: true,
          location: "Unknown", // Should be set from config
        });
      } else if (typeCode === "sha-number") {
        identifiers.push({
          identifier: id.value,
          identifierType: config.AMRS.SHA_ID_TYPE_UUID,
          preferred: false,
        });
      } else if (typeCode === "household-number") {
        identifiers.push({
          identifier: id.value,
          identifierType: config.AMRS.HOUSEHOLD_ID_TYPE_UUID,
          preferred: false,
        });
      }
    }

    return identifiers;
  }

  private static extractAttributes(hiePatient: HiePatient): any[] {
    const attributes = [];

    for (const ext of hiePatient.extension || []) {
      if (ext.url.includes("citizenship")) {
        attributes.push({
          attributeType: "8d8718c2-c2cc-11de-8d13-0010c6dffd0f", // Citizenship UUID
          value: ext.valueString,
        });
      }
    }

    return attributes;
  }
}
