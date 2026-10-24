import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Passport 'jwt' stratejisini tetikler; geçersiz token'da 401. */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
