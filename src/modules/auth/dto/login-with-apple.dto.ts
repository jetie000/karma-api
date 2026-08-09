import { IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LoginWithAppleDto {
  @ApiProperty({ description: 'JWT identity token from Apple Sign In' })
  @IsString()
  identityToken: string;

  @ApiPropertyOptional({
    description: "User's full name (only sent by Apple on first sign-in)",
  })
  @IsOptional()
  @IsString()
  fullName?: string;
}
