import { IsEnum } from 'class-validator';
import { UserStatus } from '../../../shared/enums';

export class AdminSetStatusDto {
  @IsEnum(UserStatus)
  status: UserStatus;
}
