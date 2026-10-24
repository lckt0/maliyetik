import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Role, UserStatus } from '../../../shared/enums';

export class AdminListUsersQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit: number = 25;

  @IsOptional()
  @IsString()
  cursor?: string;

  /** Verilirse offset (sayfa numaralı) modu kullanılır — `cursor` yok sayılır. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @IsOptional()
  @IsString()
  search?: string;

  /** true ise yalnızca e-postası doğrulanmış ama admin onayı bekleyen hesapları döner. */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  awaitingApproval?: boolean;
}
