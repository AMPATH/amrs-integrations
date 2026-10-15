export const mockReconciliationBundle = {
  resourceType: 'Bundle',
  id: 'b0369e43-618f-4c86-85d2-1b1485ff7f8b',
  meta: {
    tag: [
      {
        system: 'https://qa-mis.apeiro-digital.com/fhir/CodeSystem/event-type',
        code: 'CREATE',
        display: 'CREATE',
      },
    ],
  },
  identifier: {
    system: 'https://qa-mis.apeiro-digital.com/fhir/event',
    value: '12503a57-a4a1-4773-93fe-a9988db8a805-1775652010320',
  },
  type: 'collection',
  entry: [
    {
      resource: {
        resourceType: 'PaymentReconciliation',
        id: 'CLAIM-RECON-12503a57-a4a1-4773-93fe-a9988db8a805',
        status: 'active',
        created: '2026-04-08T15:40:10+03:00',
        paymentIssuer: {
          reference: 'https://qa-mis.apeiro-digital.com/fhir/Organization',
          display: 'Social Health Authority',
        },
        requestor: {
          reference: 'https://qa-mis.apeiro-digital.com/fhir/FID-01-105987-3',
          display: 'BEYONDSCOPE HOSPITAL',
        },
        paymentAmount: {
          value: 1960.0,
          currency: 'KES',
        },
        detail: [
          {
            type: {
              coding: [
                {
                  code: 'GROSS',
                },
              ],
            },
            amount: {
              value: 2000.0,
              currency: 'KES',
            },
          },
          {
            type: {
              coding: [
                {
                  code: 'PLATFORM_FEE',
                },
              ],
            },
            amount: {
              value: 40.0,
              currency: 'KES',
            },
          },
          {
            type: {
              coding: [
                {
                  code: 'NET',
                },
              ],
            },
            amount: {
              value: 1960.0,
              currency: 'KES',
            },
          },
        ],
      },
    },
    {
      resource: {
        resourceType: 'PaymentReconciliation',
        id: 'PAYRECON-840da57f-982e-4297-8bfc-4c277ec120d1',
        meta: {
          versionId: '1775652010320',
          lastUpdated: '2026-04-08T15:40:10.320+03:00',
        },
        identifier: [
          {
            system:
              'https://qa-mis.apeiro-digital.com/fhir/identifier/remittance',
          },
        ],
        status: 'active',
        created: '2026-04-08T15:40:10+03:00',
        paymentIssuer: {
          reference: 'https://qa-mis.apeiro-digital.com/fhir/Organization',
          display: 'Social Health Authority',
        },
        requestor: {
          reference: 'https://qa-mis.apeiro-digital.com/fhir/FID-01-105987-3',
          display: 'BEYONDSCOPE HOSPITAL',
        },
        disposition: 'Settled via EFT transfer',
        paymentAmount: {
          value: 1000.0,
          currency: 'KES',
        },
        paymentIdentifier: {
          system: 'https://qa-mis.apeiro-digital.com/fhir/identifier/transfer',
        },
        detail: [
          {
            extension: [
              {
                url: 'https://qa-mis.apeiro-digital.com/fhir/StructureDefinition/billFrom',
                valueDate: '2026-03-01',
              },
              {
                url: 'https://qa-mis.apeiro-digital.com/fhir/StructureDefinition/billTo',
                valueDate: '2026-03-04',
              },
              {
                url: 'https://qa-mis.apeiro-digital.com/fhir/StructureDefinition/invoicedAmount',
                valueMoney: {
                  value: 1000.0,
                  currency: 'KES',
                },
              },
              {
                url: 'https://qa-mis.apeiro-digital.com/fhir/StructureDefinition/approvedAmount',
                valueMoney: {
                  value: 1000.0,
                  currency: 'KES',
                },
              },
              {
                url: 'https://qa-mis.apeiro-digital.com/fhir/StructureDefinition/rejectedAmount',
                valueMoney: {
                  value: 0,
                  currency: 'KES',
                },
              },
              {
                url: 'https://qa-mis.apeiro-digital.com/fhir/StructureDefinition/discount',
                valueMoney: {
                  value: 0,
                  currency: 'KES',
                },
              },
              {
                url: 'https://qa-mis.apeiro-digital.com/fhir/StructureDefinition/copay',
                valueMoney: {
                  value: 0,
                  currency: 'KES',
                },
              },
              {
                url: 'https://qa-mis.apeiro-digital.com/fhir/StructureDefinition/withholdingTax',
                valueMoney: {
                  value: 0,
                  currency: 'KES',
                },
              },
              {
                url: 'https://qa-mis.apeiro-digital.com/fhir/StructureDefinition/uhc-contribution',
                valueMoney: {
                  value: 1000.0,
                  currency: 'KES',
                },
              },
            ],
            identifier: {
              system:
                'https://qa-mis.apeiro-digital.com/fhir/identifier/payer-invoice',
            },
            type: {
              coding: [
                {
                  system:
                    'https://qa-mis.apeiro-digital.com/fhir/CodeSystem/fund-type',
                  code: 'SHIF',
                  display: 'shif',
                },
              ],
            },
            request: {
              reference:
                'https://qa-mis.apeiro-digital.com/fhir/Claim/12503a57-a4a1-4773-93fe-a9988db8a805_SHIF',
              display: 'Provider Invoice Number: CUL231386/SHIF',
            },
          },
        ],
      },
    },
    {
      resource: {
        resourceType: 'PaymentNotice',
        id: '536dcbca-0aa6-4fb0-8391-1b315a879f47',
        meta: {
          versionId: '1775652010627',
          lastUpdated: '2026-04-08T15:40:10.627+03:00',
        },
        identifier: [
          {
            use: 'official',
            system:
              'https://qa-mis.apeiro-digital.com/fhir/PaymentNotice/536dcbca-0aa6-4fb0-8391-1b315a879f47',
            value: '536dcbca-0aa6-4fb0-8391-1b315a879f47',
          },
        ],
        status: 'active',
        created: '2026-04-08T15:40:10+03:00',
        provider: {
          reference: 'https://qa-mis.apeiro-digital.com/fhir/FID-01-105987-3',
          display: 'BEYONDSCOPE HOSPITAL',
        },
        payment: {
          reference:
            'https://qa-mis.apeiro-digital.com/fhir/PaymentReconciliation/PAYRECON-840da57f-982e-4297-8bfc-4c277ec120d1',
        },
        payee: {
          reference: 'https://qa-mis.apeiro-digital.com/fhir/Organization',
          display: 'Social Health Authority',
        },
        recipient: {
          reference: 'https://qa-mis.apeiro-digital.com/fhir/FID-01-105987-3',
          display: 'BEYONDSCOPE HOSPITAL',
        },
        amount: {
          value: 1000.0,
          currency: 'KES',
        },
        paymentStatus: {
          coding: [
            {
              system:
                'https://qa-mis.apeiro-digital.com/fhir/CodeSystem/paymentstatus',
              code: 'IN_PROGRESS',
              display: 'IN_PROGRESS',
            },
          ],
        },
      },
    },
    {
      resource: {
        resourceType: 'PaymentReconciliation',
        id: 'PAYRECON-dc9d7797-1298-4f71-8caa-5d6e8df7c158',
        meta: {
          versionId: '1775652010951',
          lastUpdated: '2026-04-08T15:40:10.951+03:00',
        },
        identifier: [
          {
            system:
              'https://qa-mis.apeiro-digital.com/fhir/identifier/remittance',
          },
        ],
        status: 'active',
        created: '2026-04-08T15:40:10+03:00',
        paymentIssuer: {
          reference: 'https://qa-mis.apeiro-digital.com/fhir/Organization',
          display: 'Social Health Authority',
        },
        requestor: {
          reference: 'https://qa-mis.apeiro-digital.com/fhir/FID-01-105987-3',
          display: 'BEYONDSCOPE HOSPITAL',
        },
        disposition: 'Settled via EFT transfer',
        paymentAmount: {
          value: 1000.0,
          currency: 'KES',
        },
        paymentIdentifier: {
          system: 'https://qa-mis.apeiro-digital.com/fhir/identifier/transfer',
        },
        detail: [
          {
            extension: [
              {
                url: 'https://qa-mis.apeiro-digital.com/fhir/StructureDefinition/billFrom',
                valueDate: '2026-03-01',
              },
              {
                url: 'https://qa-mis.apeiro-digital.com/fhir/StructureDefinition/billTo',
                valueDate: '2026-03-04',
              },
              {
                url: 'https://qa-mis.apeiro-digital.com/fhir/StructureDefinition/invoicedAmount',
                valueMoney: {
                  value: 1000.0,
                  currency: 'KES',
                },
              },
              {
                url: 'https://qa-mis.apeiro-digital.com/fhir/StructureDefinition/approvedAmount',
                valueMoney: {
                  value: 1000.0,
                  currency: 'KES',
                },
              },
              {
                url: 'https://qa-mis.apeiro-digital.com/fhir/StructureDefinition/rejectedAmount',
                valueMoney: {
                  value: 0,
                  currency: 'KES',
                },
              },
              {
                url: 'https://qa-mis.apeiro-digital.com/fhir/StructureDefinition/discount',
                valueMoney: {
                  value: 0,
                  currency: 'KES',
                },
              },
              {
                url: 'https://qa-mis.apeiro-digital.com/fhir/StructureDefinition/copay',
                valueMoney: {
                  value: 0,
                  currency: 'KES',
                },
              },
              {
                url: 'https://qa-mis.apeiro-digital.com/fhir/StructureDefinition/withholdingTax',
                valueMoney: {
                  value: 0,
                  currency: 'KES',
                },
              },
              {
                url: 'https://qa-mis.apeiro-digital.com/fhir/StructureDefinition/uhc-contribution',
                valueMoney: {
                  value: 1000.0,
                  currency: 'KES',
                },
              },
            ],
            identifier: {
              system:
                'https://qa-mis.apeiro-digital.com/fhir/identifier/payer-invoice',
            },
            type: {
              coding: [
                {
                  system:
                    'https://qa-mis.apeiro-digital.com/fhir/CodeSystem/fund-type',
                  code: 'ECCIF',
                  display: 'eccif',
                },
              ],
            },
            request: {
              reference:
                'https://qa-mis.apeiro-digital.com/fhir/Claim/12503a57-a4a1-4773-93fe-a9988db8a805_ECCIF',
              display: 'Provider Invoice Number: CUL231386/ECCIF',
            },
          },
        ],
      },
    },
    {
      resource: {
        resourceType: 'PaymentNotice',
        id: 'b32ca286-2e55-4d75-879a-c3c816c351bd',
        meta: {
          versionId: '1775652011265',
          lastUpdated: '2026-04-08T15:40:11.265+03:00',
        },
        identifier: [
          {
            use: 'official',
            system:
              'https://qa-mis.apeiro-digital.com/fhir/PaymentNotice/b32ca286-2e55-4d75-879a-c3c816c351bd',
            value: 'b32ca286-2e55-4d75-879a-c3c816c351bd',
          },
        ],
        status: 'active',
        created: '2026-04-08T15:40:11+03:00',
        provider: {
          reference: 'https://qa-mis.apeiro-digital.com/fhir/FID-01-105987-3',
          display: 'BEYONDSCOPE HOSPITAL',
        },
        payment: {
          reference:
            'https://qa-mis.apeiro-digital.com/fhir/PaymentReconciliation/PAYRECON-dc9d7797-1298-4f71-8caa-5d6e8df7c158',
        },
        payee: {
          reference: 'https://qa-mis.apeiro-digital.com/fhir/Organization',
          display: 'Social Health Authority',
        },
        recipient: {
          reference: 'https://qa-mis.apeiro-digital.com/fhir/FID-01-105987-3',
          display: 'BEYONDSCOPE HOSPITAL',
        },
        amount: {
          value: 1000.0,
          currency: 'KES',
        },
        paymentStatus: {
          coding: [
            {
              system:
                'https://qa-mis.apeiro-digital.com/fhir/CodeSystem/paymentstatus',
              code: 'PAID',
              display: 'PAID',
            },
          ],
        },
      },
    },
  ],
};
