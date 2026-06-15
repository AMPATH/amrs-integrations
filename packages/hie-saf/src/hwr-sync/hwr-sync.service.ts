import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { HealthWorkerRegistryService } from '../health-worker-registry/health-worker-registry.service';
import { InjectRepository } from '@nestjs/typeorm';
import { HwrSync } from '../core/database/entities/hwr_sync.entity';
import { Repository } from 'typeorm';
import { AttributeDto, ProviderAttribute } from '../shared/types';
import { ConfigService } from '@nestjs/config';
import { FetchHealthWorkerDto } from '../health-worker-registry/dto/fetch-health-worker.dto';
import {
  HealthWokerApiResponse,
  Regulators,
} from '../health-worker-registry/types';
import { HwrBatchSyncDto } from './dto/hwr-batch-sync.dto';

@Injectable()
export class HwrSyncService {
  private lisenseStatusUuid = '8fb13f77-df77-4b61-93ca-60972eae378b';
  private specialityUuid = 'c73daf69-ddd0-4fce-98ec-6f9d875193e3';
  private baseOpenMrsUrl = '';
  private licenseExpiryDateUuid = 'b6046157-40a0-4b7a-91b0-00d83b51a811';
  private basicAuth = '';
  constructor(
    @InjectRepository(HwrSync) private hwrSyncRepository: Repository<HwrSync>,
    private readonly healthWorkerRegistryService: HealthWorkerRegistryService,
    private readonly configService: ConfigService,
  ) {
    this.baseOpenMrsUrl = this.configService.get<string>('AMRS_BASE_URL') ?? '';
    this.basicAuth = this.configService.get<string>('BASIC_AUTH') ?? '';
  }
  public async batchSyncHealthWorkerRecords(hwrBatchSyncDto: HwrBatchSyncDto) {
    // get list of health workers to sync from the queue
    const hwrToSync = await this.hwrSyncRepository.findBy(hwrBatchSyncDto);

    // generate facility sync queue
    try {
      await this.hwrSyncRepository.query(
        `CALL hie.create_hwr_facility_sync_queue(?);`,
        [hwrBatchSyncDto.location_uuid],
      );
    } catch (error) {
      Logger.error(error);
      throw new HttpException(
        'Failed to generate sync queue',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    let i = 0;
    for (const hwr of hwrToSync) {
      console.log({ i });
      await this.syncHealthWorker(hwr);
      i++;
    }
    return {
      message: 'HWR Records for facility succefully synced',
    };
  }
  private async syncHealthWorker(hwr: HwrSync) {
    console.log('syncHealthWorker...');
    // GET national id
    const nationalId = hwr.national_id;
    console.log({ nationalId });
    // use national id to get hwr from hie
    const fetchHealthWorkerDto: FetchHealthWorkerDto = {
      identifierNumber: nationalId,
      identifierType: 'National ID',
      regulator: Regulators.Kmpdc,
      locationUuid: '090089ea-1352-11df-a1f1-0026b9348838 ',
    };
    const resp: HealthWokerApiResponse =
      await this.healthWorkerRegistryService.fetchHealthWorkerFromRegistry(
        fetchHealthWorkerDto,
      );

    if (!resp) {
      throw new Error('Error getting health worker records from HWR');
    }
    const hw = resp.message;
    console.log({ hw });
    if (hw && hw['error']) {
      console.error(hw['error']);
      return false;
    }
    const memberStatus = hw.membership.status;
    console.log({ memberStatus });
    const speciality = hw.membership.specialty
      ? hw.membership.specialty
      : hw.professional_details.specialty;

    let licenseExpiryDate: string = '';

    console.log({ speciality });
    if (hw.licenses && hw.licenses.length > 0) {
      licenseExpiryDate = hw.licenses[0].license_end
        ? hw.licenses[0].license_end
        : '';
    }

    // Get provider records

    const provider = await this.getProvider(hwr.provider_uuid);
    console.log({ provider });
    if (!provider) {
      throw new Error('Error getting provider from AMRS');
    }

    const providerAttributes: ProviderAttribute[] =
      provider['attributes'] ?? [];

    console.log({ providerAttributes });

    // update member status
    const statusResp = await this.handleAttributeCreateAndUpdate(
      providerAttributes,
      this.lisenseStatusUuid,
      memberStatus,
      hwr.provider_uuid,
    );

    console.log('Added license status', { statusResp });

    if (licenseExpiryDate) {
      console.log({ licenseExpiryDate });
      // update member license expiry date
      const licenseExpiryDateResp = await this.handleAttributeCreateAndUpdate(
        providerAttributes,
        this.licenseExpiryDateUuid,
        licenseExpiryDate,
        hwr.provider_uuid,
      );

      console.log('Added license expiry data', { licenseExpiryDateResp });
    }

    // update speciality
    await this.handleAttributeCreateAndUpdate(
      providerAttributes,
      this.specialityUuid,
      speciality,
      hwr.provider_uuid,
    );
    console.log('Added Speciality', { statusResp });

    console.log('Done...........############################');
  }
  private handleAttributeCreateAndUpdate(
    providerAttributes: ProviderAttribute[],
    attributeTypeUuid: string,
    value: string,
    providerUuid: string,
  ) {
    const attribute = this.getAttribute(attributeTypeUuid, providerAttributes);
    // if provider has the properties then update them
    const payload: AttributeDto = {
      attributeType: attributeTypeUuid,
      value: value,
    };
    if (attribute) {
      console.log('Patient has attribute');
      return this.updateAttribute(payload, providerUuid, attribute.uuid);
    } else {
      console.log('Patient does not have attribute');
      return this.creatAttribute(payload, providerUuid);
    }
  }
  private getAttribute(
    attributeTypeUuid: string,
    attributes: ProviderAttribute[],
  ): ProviderAttribute | undefined {
    return attributes.find((p) => {
      return p.attributeType.uuid === attributeTypeUuid;
    });
  }
  private updateAttribute(
    updateAttributeDto: AttributeDto,
    providerUuid: string,
    providerAttributeUuid: string,
  ) {
    const url = `https://${this.baseOpenMrsUrl}/openmrs/ws/rest/v1/provider/${providerUuid}/attribute/${providerAttributeUuid}`;
    console.log('update attribute...:', url);
    return this.sendPostRequest(updateAttributeDto, url);
  }
  private creatAttribute(
    createAttributeDto: AttributeDto,
    providerUuid: string,
  ) {
    const url = `https://${this.baseOpenMrsUrl}/openmrs/ws/rest/v1/provider/${providerUuid}/attribute`;
    console.log('create attribute...:', url);
    return this.sendPostRequest(createAttributeDto, url);
  }
  private async sendPostRequest(
    attributeDto: AttributeDto,
    attrubuteUrl: string,
  ) {
    const resp = await fetch(attrubuteUrl, {
      method: 'POST',
      headers: {
        authorization: `Basic ${this.basicAuth}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(attributeDto),
    });
    console.log({ resp });
    const data = await resp.json();
    return data;
  }

  private async getProvider(providerUuid: string) {
    const providerUrl = `https://${this.baseOpenMrsUrl}/openmrs/ws/rest/v1/provider/${providerUuid}?v=custom:(uuid,display,person,attributes:(uuid,display,value,attributeType:(uuid,display)))`;
    const resp = await fetch(providerUrl, {
      method: 'GET',
      headers: {
        authorization: `Basic ${this.basicAuth}`,
      },
    });
    const data = await resp.json();
    return data;
  }
}
