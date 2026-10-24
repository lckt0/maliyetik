import { BadRequestException } from '@nestjs/common';
import { MetadataSchema } from '../../../database/entities/document-type.entity';

export interface ValidatedMetadata {
  metadata: Record<string, unknown>;
  documentDate?: string;
}

/**
 * Türün metadata_schema'sına göre kullanıcı meta verisini doğrular ve
 * normalize eder. `documentDate` alanı ayrıca üst seviyeye (documents.document_date)
 * çıkarılır. Kanonik alanlar (canonical:true) DB'de generated meta_* kolonlarına
 * gider — burada yalnızca doğru anahtarla metadata'ya yazılmaları yeterli.
 */
export function validateAndExtractMetadata(
  schema: MetadataSchema | undefined,
  input: Record<string, unknown>,
): ValidatedMetadata {
  const metadata: Record<string, unknown> = {};
  let documentDate: string | undefined;

  if (!schema?.fields) return { metadata: input ?? {} };

  for (const field of schema.fields) {
    const raw = input?.[field.key];
    const present = raw !== undefined && raw !== null && raw !== '';

    if (!present) {
      if (field.required) {
        throw new BadRequestException(`Zorunlu alan eksik: ${field.label} (${field.key})`);
      }
      continue;
    }

    let value: unknown = raw;
    switch (field.type) {
      case 'decimal': {
        const n = Number(raw);
        if (Number.isNaN(n)) throw new BadRequestException(`${field.label} sayısal olmalı.`);
        value = n;
        break;
      }
      case 'date': {
        const s = String(raw);
        if (!/^\d{4}-\d{2}-\d{2}/.test(s)) {
          throw new BadRequestException(`${field.label} YYYY-MM-DD formatında olmalı.`);
        }
        value = s.slice(0, 10);
        break;
      }
      case 'enum': {
        if (field.options && !field.options.includes(String(raw))) {
          throw new BadRequestException(`${field.label} geçersiz. Beklenen: ${field.options.join(', ')}`);
        }
        value = String(raw);
        break;
      }
      case 'json':
        value = raw;
        break;
      default:
        value = String(raw);
    }

    metadata[field.key] = value;
    if (field.key === 'documentDate') documentDate = value as string;
  }

  // Türde `documentDate` alanı yoksa şemanın işaret ettiği alandan (ör. çekte keşide
  // tarihi, ekstrede dönem bitişi) türetilir — aksi halde `documents.document_date`
  // NULL kalır ve tarih aralığı filtreleri o evrakları sessizce dışarıda bırakır.
  if (!documentDate && schema.dateField) {
    const derived = metadata[schema.dateField];
    if (typeof derived === 'string' && /^\d{4}-\d{2}-\d{2}/.test(derived)) {
      documentDate = derived.slice(0, 10);
    }
  }

  return { metadata, documentDate };
}
