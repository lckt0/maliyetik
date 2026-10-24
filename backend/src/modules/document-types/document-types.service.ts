import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DocumentType } from '../../database/entities';
import { DocumentCategory } from '../../shared/enums';

@Injectable()
export class DocumentTypesService {
  constructor(
    @InjectRepository(DocumentType) private readonly repo: Repository<DocumentType>,
  ) {}

  findAll(category?: DocumentCategory): Promise<DocumentType[]> {
    return this.repo.find({
      where: { isActive: 1, ...(category ? { category } : {}) },
      order: { sortOrder: 'ASC' },
    });
  }

  async findByIdOrThrow(id: number): Promise<DocumentType> {
    const t = await this.repo.findOne({ where: { id, isActive: 1 } });
    if (!t) throw new NotFoundException('Evrak türü bulunamadı.');
    return t;
  }

  /** Tür seçilmeden yüklenen evraklar için varsayılan ("Belirtilmedi") tür. */
  async findUnspecifiedOrThrow(): Promise<DocumentType> {
    const t = await this.repo.findOne({ where: { code: 'belirtilmedi', isActive: 1 } });
    if (!t) throw new NotFoundException('Varsayılan evrak türü bulunamadı.');
    return t;
  }

  async findByCodeOrThrow(code: string): Promise<DocumentType> {
    const t = await this.repo.findOne({ where: { code, isActive: 1 } });
    if (!t) throw new NotFoundException('Evrak türü bulunamadı.');
    return t;
  }
}
