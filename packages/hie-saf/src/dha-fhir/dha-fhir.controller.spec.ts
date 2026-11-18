import { ConfigService } from '@nestjs/config';
import { DhaFhirController } from './dha-fhir.controller';
import { DhaFhirResourcesService } from './dha-fhir-resources.service';

type AnyResource = Record<string, any>;

describe('DhaFhirController report routes (REP-PHE / REP-IHR)', () => {
  const request = { headers: {} } as any;
  const alert = (id: string): AnyResource => ({
    resourceType: 'Communication',
    id: `alert-${id}`,
    about: [{ reference: `DetectedIssue/${id}` }],
  });
  const CHOLERA = 'outbreak-cholera-2026-01-01-2026-10-31-1';
  const MEASLES = 'outbreak-measles-2026-01-01-2026-10-31-2';

  let resources: Record<string, jest.Mock>;
  let controller: DhaFhirController;

  beforeEach(() => {
    resources = {
      detectedIssuesForOutbreak: jest.fn().mockResolvedValue([]),
      ihrTasks: jest.fn().mockResolvedValue([]),
      communicationsForOutbreak: jest.fn().mockResolvedValue([alert(CHOLERA), alert(MEASLES)]),
      demoPatientUuid: jest.fn().mockReturnValue(''),
    };
    controller = new DhaFhirController(
      { get: jest.fn() } as unknown as ConfigService,
      resources as unknown as DhaFhirResourcesService,
    );
  });

  it('normalizes single-digit date params on the outbreak DetectedIssue route', async () => {
    await controller.detectedIssue(request, undefined, 'outbreak', undefined, undefined, '2026-1-1', '2026-10-31');

    expect(resources.detectedIssuesForOutbreak).toHaveBeenCalledWith('2026-01-01', '2026-10-31', expect.anything());
  });

  it('normalizes single-digit date params on the IHR Task route', async () => {
    await controller.task(request, undefined, 'requested', 'ihr-notify', undefined, '2026-1-1', '2026-9-5');

    expect(resources.ihrTasks).toHaveBeenCalledWith('2026-01-01', '2026-09-05', expect.anything());
  });

  it('filters Communication to the referenced outbreak issue', async () => {
    const bundle = await controller.communication(request, `DetectedIssue/${CHOLERA}`, 'alert');

    // window derived from the issue id
    expect(resources.communicationsForOutbreak).toHaveBeenCalledWith(
      '2026-01-01', '2026-10-31', expect.anything(), undefined,
    );
    expect(bundle.entry.map((e: AnyResource) => e.resource.id)).toEqual([`alert-${CHOLERA}`]);
  });

  it('serves the window alerts when `about` names no outbreak issue (e.g. alert-1)', async () => {
    const bundle = await controller.communication(
      request, 'DetectedIssue/alert-1', 'alert', '2026-1-1', '2026-10-31',
    );

    expect(resources.communicationsForOutbreak).toHaveBeenCalledWith(
      '2026-01-01', '2026-10-31', expect.anything(), undefined,
    );
    expect(bundle.total).toBe(2);
  });

  it('stays empty for an outbreak id that is not in the window', async () => {
    const bundle = await controller.communication(
      request, 'DetectedIssue/outbreak-dengue_fever-2026-01-01-2026-10-31-9', 'alert',
    );

    expect(bundle.total).toBe(0);
  });
});
