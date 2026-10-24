import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Note, User } from '../../database/entities';
import { NotesService } from './notes.service';
import { NotesController } from './notes.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { MailModule } from '../../infrastructure/mail/mail.module';

@Module({
  imports: [TypeOrmModule.forFeature([Note, User]), NotificationsModule, MailModule],
  controllers: [NotesController],
  providers: [NotesService],
})
export class NotesModule {}
