import { Module } from '@nestjs/common';
import { ExportController } from './export.controller';
import { EXPORT_CONTRIBUTORS, ExportService } from './export.service';

@Module({
  controllers: [ExportController],
  providers: [ExportService, { provide: EXPORT_CONTRIBUTORS, useValue: [] }],
})
export class ExportModule {}
