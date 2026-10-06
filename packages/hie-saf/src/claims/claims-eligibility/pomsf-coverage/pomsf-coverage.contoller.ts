import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { PomsfCoverageService } from './pomsf-coverage.service';
import { OpenMrsAuthGuard } from 'src/auth/guards/openmrs-auth-guard/openmrs-auth.guard';
import { PomsfCoverageDto } from './dto/pomsf-coverage.dto';

@UseGuards(OpenMrsAuthGuard)
@Controller('pomsf')
export class PomsfCoverageController {
  constructor(private readonly pomsfCoverageService: PomsfCoverageService) {}

  @Post('set-effective-coverage')
  public async setEffectivePomsfCoverage(
    @Body() pomsfCoverageDto: PomsfCoverageDto,
  ) {
    return this.pomsfCoverageService.setEffectivePomsfCoverage(
      pomsfCoverageDto,
    );
  }
}
