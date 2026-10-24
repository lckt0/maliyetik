import { SetMetadata } from '@nestjs/common';
import { Role } from '../../shared/enums';

export const ROLES_KEY = 'roles';

/** Controller/handler'a izin verilen rolleri işaretler. RolesGuard okur. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
