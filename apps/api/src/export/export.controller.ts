import { Controller, Get, Header, Res } from '@nestjs/common';
import type { Response } from 'express';
import { DateTime } from 'luxon';
import { SettingsService } from '../settings/settings.service';
import { ExportService } from './export.service';

@Controller('export')
export class ExportController {
  constructor(
    private readonly exporter: ExportService,
    private readonly settings: SettingsService,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async download(@Res({ passthrough: true }) res: Response): Promise<Record<string, unknown>> {
    const now = new Date();
    const timeZone = await this.settings.get('general.timezone');
    const date = DateTime.fromJSDate(now, { zone: timeZone }).toFormat('yyyy-MM-dd');
    res.setHeader('Content-Disposition', `attachment; filename="personal-apps-${date}.json"`);
    return this.exporter.build(now);
  }
}
