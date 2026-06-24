import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HieHttpRequests } from '../../hie-http-request/hie-http-requests';
import { SearchPatientContactsDto } from './dto/search-patient-contact.dto';
import { PatientContactResponse } from './types';

@Injectable()
export class ContactsService {
  constructor(
    private readonly hieHttpRequests: HieHttpRequests,
    private readonly configService: ConfigService,
  ) {}
  async fetchPatientContacts(
    searchPatientContactsDto: SearchPatientContactsDto,
    locationUuid: string,
  ) {
    const baseUrl = this.configService.get<string>('HIE_CLIAMS_BASE_URL') ?? '';
    const contactsUrl = `${baseUrl}/api/v1/patients/contacts?patient_id=${searchPatientContactsDto.crId}`;
    try {
      const response = await this.hieHttpRequests.sendGetRequest(
        contactsUrl,
        locationUuid,
      );
      const data = (await response.json()) as PatientContactResponse;
      return data ?? [];
    } catch (error) {
      console.error(error);
      throw new HttpException(
        'Error fetching Data',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
