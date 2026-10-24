import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { Document } from '../../database/entities';
import { DocumentStatus } from '../../shared/enums';
import { NotificationsService } from '../notifications/notifications.service';

const NOTIFICATION_TYPE = 'possible_duplicate_document';
const SCAN_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Checksum ile BİREBİR aynı dosya yüklemede zaten engellenir (bkz. DocumentsService).
 * Bu servis daha "yumuşak" bir örtüşmeyi günde bir kez (gece 02:00) tarar: aynı mükellef +
 * aynı evrak türü + aynı Belge No + VKN/TCKN + Tutar (kanonik `meta_*` kolonları) — ör. aynı
 * faturanın farklı taranmış/foto hali. Yalnızca UYARIR, engellemez; her evrak için en
 * fazla bir kez bildirim üretir (bkz. `NotificationsService.documentIdsWithExistingNotification`).
 */
@Injectable()
export class DuplicateScanService {
  private readonly logger = new Logger(DuplicateScanService.name);

  constructor(
    @InjectRepository(Document) private readonly documents: Repository<Document>,
    private readonly notifications: NotificationsService,
  ) {}

  // timeZone açıkça verilir: backend container'ına TZ env'i geçilmiyor (yalnızca mysql'e
  // geçiliyor), server saati UTC olabilir — "gece 02:00" İstanbul saatiyle sabitlenir.
  @Cron('0 0 2 * * *', { timeZone: 'Europe/Istanbul' })
  async scanRecentUploads(): Promise<void> {
    const since = new Date(Date.now() - SCAN_WINDOW_MS);
    const recent = await this.documents.find({
      where: { status: DocumentStatus.ACTIVE, createdAt: MoreThanOrEqual(since) },
    });
    const candidates = recent.filter((d) => d.metaDocNo && d.metaTaxId && d.metaAmount != null);
    if (!candidates.length) return;

    // Tek sorguda toplu kontrol — her evrak için ayrı ayrı tam tablo taraması yapmaz (N+1 giderildi).
    const alreadyNotified = await this.notifications.documentIdsWithExistingNotification(
      NOTIFICATION_TYPE,
      candidates.map((d) => d.id),
    );
    const pending = candidates.filter((d) => !alreadyNotified.has(d.id));

    const results = await Promise.allSettled(pending.map((doc) => this.checkAndNotify(doc)));
    results.forEach((result, i) => {
      if (result.status === 'rejected') {
        this.logger.warn(`Çift evrak taraması başarısız (document=${pending[i].id}): ${(result.reason as Error)?.message}`);
      }
    });
  }

  private async checkAndNotify(doc: Document): Promise<void> {
    const matches = await this.documents.find({
      where: {
        taxpayerId: doc.taxpayerId,
        documentTypeId: doc.documentTypeId,
        metaDocNo: doc.metaDocNo,
        metaTaxId: doc.metaTaxId,
        metaAmount: doc.metaAmount,
        status: DocumentStatus.ACTIVE,
      },
      select: ['id', 'title'],
    });
    const others = matches.filter((m) => m.id !== doc.id);
    if (!others.length) return;

    await this.notifications.create({
      userId: doc.uploadedByUserId,
      type: NOTIFICATION_TYPE,
      title: 'Olası çift evrak',
      body: `"${doc.title}" evrağı; aynı belge no, VKN/TCKN ve tutara sahip ${others.length} evrakla eşleşiyor (${others.map((o) => `"${o.title}"`).join(', ')}). Lütfen kontrol edip gerekirse birini silin.`,
      metadata: { documentId: doc.id, matchedDocumentIds: others.map((o) => o.id) },
    });
  }
}
