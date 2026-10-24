import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Configuration } from '../../config/configuration';
import { AuthUser } from '../../common/types/auth-user';
import { Role } from '../../shared/enums';

export interface AccessTokenPayload {
  sub: string;
  role: Role;
  tid?: string; // taxpayerId
  aid?: string; // accountantId
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService<Configuration, true>) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('jwt.accessSecret', { infer: true }),
    });
  }

  /** Dönen değer request.user olur — DB'ye gitmeden token'dan bağlam. */
  validate(payload: AccessTokenPayload): AuthUser {
    return {
      userId: payload.sub,
      role: payload.role,
      taxpayerId: payload.tid,
      accountantId: payload.aid,
    };
  }
}
