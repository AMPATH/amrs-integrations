import axios from 'axios';
import config from '../../config/env';
import { logger } from '../../utils/logger';

export class AmrsService {
  private baseUrl = config.AMRS.BASE_URL;
  private auth = {
    username: config.AMRS.USERNAME,
    password: config.AMRS.PASSWORD
  };

  async findPatientByNationalId(nationalId: string): Promise<any> {
    try {
      const response = await axios.get(
        `${this.baseUrl}/ws/rest/v1/patient?identifier=${nationalId}&v=full`,
        { auth: this.auth }
      );
      
      return response.data.results[0] || null;
    } catch (error: any) {
      logger.error(`AMRS patient lookup failed: ${error.message}`);
      return null;
    }
  }

  async createPatient(patientData: any): Promise<any> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/ws/rest/v1/patient`,
        patientData,
        { 
          auth: this.auth,
          headers: { 'Content-Type': 'application/json' }
        }
      );
      return response.data;
    } catch (error: any) {
      throw new Error(`AMRS patient creation failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  async updatePatient(uuid: string, updates: any): Promise<any> {
    try {
      // Fetch existing patient
      const existing = await axios.get(
        `${this.baseUrl}/ws/rest/v1/patient/${uuid}?v=full`,
        { auth: this.auth }
      );
      
      // Merge updates
      const updatedPatient = this.mergePatientData(existing.data, updates);
      
      // Send update
      const response = await axios.post(
        `${this.baseUrl}/ws/rest/v1/patient/${uuid}`,
        updatedPatient,
        { 
          auth: this.auth,
          headers: { 'Content-Type': 'application/json' }
        }
      );
      
      return response.data;
    } catch (error: any) {
      throw new Error(`AMRS patient update failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  private mergePatientData(existing: any, updates: any): any {
    return {
      ...existing,
      person: {
        ...existing.person,
        ...updates.person,
        names: [
          ...(existing.person.names.filter((n: any) => !n.preferred)),
          ...updates.person.names
        ],
        addresses: [
          ...(existing.person.addresses.filter((a: any) => !a.preferred)),
          ...updates.person.addresses
        ],
        attributes: [
          ...existing.person.attributes,
          ...updates.person.attributes
        ]
      },
      identifiers: [
        ...existing.identifiers,
        ...updates.identifiers
      ]
    };
  }

   async findProviderByIdentifier(identifier: string): Promise<any> {
    try {
      const response = await axios.get(
        `${this.baseUrl}/ws/rest/v1/provider?identifier=${identifier}&v=full`,
        { auth: this.auth }
      );
      
      return response.data.results[0] || null;
    } catch (error: any) {
      logger.error(`AMRS provider lookup failed: ${error.message}`);
      return null;
    }
  }

  async updateProvider(uuid: string, updates: { 
    licenseStatus?: string; 
    licenseExpiration?: string 
  }): Promise<any> {
    try {
      // Fetch existing provider
      const existing = await axios.get(
        `${this.baseUrl}/ws/rest/v1/provider/${uuid}?v=full`,
        { auth: this.auth }
      );
      
      // Create attribute payload
      const attributes = [
        ...(existing.data.attributes || []),
        ...this.createLicenseAttributes(updates)
      ];
      
      // Update provider
      const response = await axios.post(
        `${this.baseUrl}/ws/rest/v1/provider/${uuid}`,
        {
          ...existing.data,
          attributes
        },
        { 
          auth: this.auth,
          headers: { 'Content-Type': 'application/json' }
        }
      );
      
      return response.data;
    } catch (error: any) {
      throw new Error(`AMRS provider update failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  private createLicenseAttributes(updates: { 
    licenseStatus?: string; 
    licenseExpiration?: string 
  }): any[] {
    const attributes = [];
    
    if (updates.licenseStatus) {
      attributes.push({
        attributeType: '7f4db7a0-c2cc-11de-8d13-0010c6dffd0f', // License Status UUID
        value: updates.licenseStatus
      });
    }
    
    if (updates.licenseExpiration) {
      attributes.push({
        attributeType: '7f4db8a4-c2cc-11de-8d13-0010c6dffd0f', // License Expiration UUID
        value: updates.licenseExpiration
      });
    }
    
    return attributes;
  }
}