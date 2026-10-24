import { Controller, Get, Param } from '@nestjs/common';
import { UsersService } from './users.service';

/**
 * Girişsiz herkese açık profil ucu — <site>/u/:username frontend
 * rotasının veri kaynağı. Guard YOK: bilinçli olarak public. `UsersService`
 * yalnızca `is_public=true` ve aktif kullanıcılar için allowlist alanları
 * döner (e-posta/telefon/id gibi hassas veriler asla dahil edilmez).
 */
@Controller('public/users')
export class PublicProfileController {
  constructor(private readonly users: UsersService) {}

  @Get(':username')
  getPublicProfile(@Param('username') username: string) {
    return this.users.getPublicProfile(username);
  }
}
