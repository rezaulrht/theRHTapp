import { Module } from '@nestjs/common';
import { FoldersController, FoldersService } from './folders';

@Module({
  controllers: [FoldersController],
  providers: [FoldersService],
  exports: [FoldersService],
})
export class VaultModule {}
