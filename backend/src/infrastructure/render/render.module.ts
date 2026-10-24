import { Global, Module } from '@nestjs/common';
import { HtmlToPdfService } from './html-to-pdf.service';

/** HTML→PDF dönüşümü tüm modüllerden kullanılabilsin diye global. */
@Global()
@Module({
  providers: [HtmlToPdfService],
  exports: [HtmlToPdfService],
})
export class RenderModule {}
