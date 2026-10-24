import { Controller, Get } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QuotaPackage } from '../../database/entities';

/** Kimlik doğrulaması gerektirmez — landing page fiyatlandırma vitrini bunu okur. */
@Controller('quota-packages')
export class QuotaPackagesController {
  constructor(@InjectRepository(QuotaPackage) private readonly repo: Repository<QuotaPackage>) {}

  @Get()
  list() {
    return this.repo.find({ where: { isActive: 1 }, order: { sortOrder: 'ASC' } });
  }
}
