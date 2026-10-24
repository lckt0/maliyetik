import { Role } from '../../shared/enums';

/** JWT'den türeyip request'e iliştirilen kimlik bağlamı. */
export interface AuthUser {
  userId: string;
  role: Role;
  email?: string;
  fullName?: string;
  username?: string;
  /** taxpayer rolündeyse kendi profil id'si */
  taxpayerId?: string;
  /** accountant rolündeyse kendi profil id'si */
  accountantId?: string;
}
