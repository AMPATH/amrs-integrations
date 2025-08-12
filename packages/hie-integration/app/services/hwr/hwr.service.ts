import axios from "axios";
import { TokenService } from "../auth/token.service";
import config from "../../config/env";
import { HiePractitioner, FhirBundle } from "../../types/hie.type";
import { AmrsService } from "../amrs/amrs.service";
import { logger } from "../../utils/logger";

export class HwrService {
  private tokenService = new TokenService();
  private amrsService = new AmrsService();

  async fetchPractitionerFromHie(nationalId: string): Promise<HiePractitioner> {
    const token = await this.tokenService.getAccessToken();
    const url = `${config.HIE.HWR_URL}?identifierType=National ID&identifierNumber=${nationalId}`;

    try {
      const response = await axios.get<FhirBundle<HiePractitioner>>(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.data.total === 0) {
        throw new Error("Practitioner not found in HWR");
      }

      return response.data.entry[0].resource;
    } catch (error: any) {
      logger.error(`HIE HWR request failed: ${error.message}`);
      throw new Error(
        `Failed to fetch practitioner from HIE: ${
          error.response?.data?.error || error.message
        }`
      );
    }
  }

  async updateLicenseStatus(
    nationalId: string,
    providerUuid?: string
  ): Promise<any> {
    const practitioner = await this.fetchPractitionerFromHie(nationalId);
    const licenseInfo = this.extractLatestLicense(practitioner);

    // If provider UUID is not provided, try to find by national ID
    let targetUuid = providerUuid;
    if (!targetUuid) {
      const provider = await this.amrsService.findProviderByIdentifier(
        nationalId
      );
      targetUuid = provider?.uuid;
    }

    if (!targetUuid) {
      throw new Error(
        `Provider not found in AMRS for national ID: ${nationalId}`
      );
    }

    return this.amrsService.updateProvider(targetUuid, {
      licenseStatus: licenseInfo.status,
      licenseExpiration: licenseInfo.endDate,
    });
  }

  private extractLatestLicense(practitioner: HiePractitioner): {
    status: string;
    endDate: string;
  } {
    if (!practitioner.qualification) {
      return { status: "unknown", endDate: "" };
    }

    // Extract all licenses with status
    const licenses = practitioner.qualification
      .filter((q) => q.extension?.some((e) => e.url.includes("license-status")))
      .map((q) => {
        const statusExt = q.extension?.find((e) =>
          e.url.includes("license-status")
        );
        return {
          status: statusExt?.valueString || "unknown",
          endDate: q.period?.end || "",
          startDate: q.period?.start || "",
        };
      });

    // Find the most recent active license
    const activeLicense = licenses
      .filter((l) => l.status === "active")
      .sort(
        (a, b) => new Date(b.endDate).getTime() - new Date(a.endDate).getTime()
      )[0];

    // Return active license if found, otherwise try to find any license
    return activeLicense || licenses[0] || { status: "unknown", endDate: "" };
  }
}
