import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { CompanyDocumentsController } from './company-documents.controller';

@Module({
  imports: [DocumentsModule],
  controllers: [CompanyDocumentsController],
})
export class CompanyDocumentsModule {}
