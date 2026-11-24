import { Module } from '@nestjs/common';
import { FieldsController, FieldsService } from './fields';
import { FilesController, FilesService } from './files';
import { FoldersController, FoldersService } from './folders';
import { FILE_STORAGE } from './storage/file-storage';
import { LocalFilesController, LocalFileStorage } from './storage/local-storage';
import { DynamicStorage, R2ConfigService, StorageSettingsController } from './storage/storage-settings';
import { PlannerController, PlannerService } from './planner';
import { SearchController, SearchService } from './search';
import { TrashController, TrashService } from './trash';
import { VaultExportService } from './vault-export';

@Module({
  controllers: [StorageSettingsController, FoldersController, FilesController, FieldsController, SearchController, TrashController, PlannerController, LocalFilesController],
  providers: [
    FoldersService,
    FilesService,
    FieldsService,
    SearchService,
    TrashService,
    PlannerService,
    VaultExportService,
    LocalFileStorage,
    R2ConfigService,
    DynamicStorage,
    { provide: FILE_STORAGE, useExisting: DynamicStorage },
  ],
  exports: [FoldersService, FilesService, FieldsService, FILE_STORAGE],
})
export class VaultModule {}
