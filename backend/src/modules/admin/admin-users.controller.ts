import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AdminUsersService } from './admin-users.service';
import { AdminListUsersQueryDto } from './dto/admin-list-users.dto';
import { AdminUpdateUserDto } from './dto/admin-update-user.dto';
import { AdminChangeRoleDto } from './dto/admin-change-role.dto';
import { AdminSetStatusDto } from './dto/admin-set-status.dto';
import { AdminApproveBulkDto } from './dto/admin-approve-bulk.dto';
import { AdminSetPasswordDto } from './dto/admin-set-password.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../common/types/auth-user';
import { Role } from '../../shared/enums';
import { AuthService } from '../auth/auth.service';

@Controller('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminUsersController {
  constructor(
    private readonly adminUsers: AdminUsersService,
    private readonly auth: AuthService,
  ) {}

  @Get()
  list(@Query() query: AdminListUsersQueryDto) {
    return this.adminUsers.list(query);
  }

  /** Toplu onay path'i tekil `/:id` route'undan önce tanımlanmalı (aksi halde 'approve-bulk' bir id gibi eşleşir). */
  @Post('approve-bulk')
  approveBulk(@CurrentUser() actor: AuthUser, @Body() dto: AdminApproveBulkDto) {
    return this.adminUsers.approveBulk(dto.ids, actor.userId);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.adminUsers.getById(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: AdminUpdateUserDto) {
    return this.adminUsers.update(id, dto);
  }

  @Patch(':id/role')
  changeRole(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() dto: AdminChangeRoleDto) {
    return this.adminUsers.changeRole(id, dto, actor.userId);
  }

  @Patch(':id/status')
  setStatus(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() dto: AdminSetStatusDto) {
    return this.adminUsers.setStatus(id, dto.status, actor.userId);
  }

  @Post(':id/approve')
  async approve(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    await this.adminUsers.approve(id, actor.userId);
    return { ok: true };
  }

  @Post(':id/reject')
  async reject(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    await this.adminUsers.reject(id, actor.userId);
    return { ok: true };
  }

  @Delete(':id')
  async remove(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    await this.adminUsers.remove(id, actor.userId);
    return { ok: true };
  }

  /** Admin'in, hedef kullanıcının hesabına geçici olarak geçmesini sağlar (destek/hata ayıklama). Adminler birbirini impersonate edemez. */
  @Post(':id/impersonate')
  impersonate(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.auth.impersonate(id, actor.userId);
  }

  /** Şifreyi admin doğrudan belirler — kullanıcının tüm oturumları kapanır. */
  @Patch(':id/password')
  async setPassword(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() dto: AdminSetPasswordDto) {
    await this.auth.adminSetPassword(id, dto.password, actor.userId);
    return { ok: true };
  }

  /** Kullanıcıya iletilmek üzere şifre sıfırlama bağlantısı üretir — e-posta gönderilmez, bağlantı admin'e döner. */
  @Post(':id/password-reset-link')
  createPasswordResetLink(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.auth.adminCreatePasswordResetLink(id, actor.userId);
  }
}
