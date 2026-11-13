import { Body, Controller, Get, Patch } from '@nestjs/common';
import type { Settings } from '@pa/shared';
import { SettingsService } from './settings.service';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  getAll(): Promise<Settings> {
    return this.settings.getAll();
  }

  @Patch()
  patch(@Body() body: unknown): Promise<Settings> {
    return this.settings.patch(body);
  }
}
