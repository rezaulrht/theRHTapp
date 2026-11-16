import { Module } from '@nestjs/common';
import { ENV, type Env } from '../env';
import { FieldsController, FieldsService } from './fields';
import { FilesController, FilesService } from './files';
import { FoldersController, FoldersService } from './folders';
import { FILE_STORAGE, type FileStorage, MissingStorage } from './storage/file-storage';
import { LocalFilesController, LocalFileStorage } from './storage/local-storage';
import { R2Storage } from './storage/r2-storage';
import { SearchController, SearchService } from './search';
import { TrashController, TrashService } from './trash';

/** R2 when its keys are set; files on disk in development; nothing in production until then. */
function chooseStorage(env: Env, local: LocalFileStorage): FileStorage {
  if (env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET) {
    return new R2Storage({
      accountId: env.R2_ACCOUNT_ID,
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      bucket: env.R2_BUCKET,
    });
  }
  return env.NODE_ENV === 'production' ? new MissingStorage() : local;
}

@Module({
  controllers: [FoldersController, FilesController, FieldsController, SearchController, TrashController, LocalFilesController],
  providers: [
    FoldersService,
    FilesService,
    FieldsService,
    SearchService,
    TrashService,
    LocalFileStorage,
    { provide: FILE_STORAGE, useFactory: chooseStorage, inject: [ENV, LocalFileStorage] },
  ],
  exports: [FoldersService, FilesService, FieldsService, FILE_STORAGE],
})
export class VaultModule {}
