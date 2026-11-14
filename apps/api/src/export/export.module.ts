import { Global, Module } from '@nestjs/common';
import { ExportController } from './export.controller';
import { EXPORT_CONTRIBUTORS, ExportService } from './export.service';

@Global()
@Module({
  controllers: [ExportController],
  providers: [ExportService, { provide: EXPORT_CONTRIBUTORS, useValue: [] }],
  exports: [ExportService],
})
export class ExportModule {}
