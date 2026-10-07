import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RequestOtpDto {
  @ApiProperty({ example: '+6281234567890' })
  @Matches(/^\+?[1-9]\d{8,14}$/)
  phone!: string;
}

export class VerifyOtpDto extends RequestOtpDto {
  @ApiProperty({ example: '000000' })
  @Matches(/^\d{6}$/)
  code!: string;

  @ApiProperty({ example: 'Andi Wijaya', required: false })
  @IsOptional()
  @IsString()
  name?: string;
}

export class StaffLoginDto {
  @ApiProperty({ example: 'cashier@kedai.local' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: '1234' })
  @IsString()
  @MinLength(4)
  secret!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  branchId?: string;
}

export class ManagerReauthorizeDto {
  @ApiProperty({ example: '2468' })
  @IsString()
  @MinLength(4)
  @MaxLength(12)
  pin!: string;

  @ApiProperty({ example: 'refund:order-id' })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  reason!: string;
}
