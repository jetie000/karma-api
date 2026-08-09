import { IsIn, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const subscriptionTypes = ['pro', 'pro_plus'] as const;

export class ActivateSubscriptionDto {
  @ApiProperty({ enum: subscriptionTypes, example: 'pro' })
  @IsString()
  @IsIn(subscriptionTypes)
  subscriptionType: string;

  @ApiPropertyOptional({
    description: 'App Store or Google Play receipt for server-side validation',
  })
  @IsOptional()
  @IsString()
  receipt?: string;

  @ApiPropertyOptional({ description: 'Google Play purchase token' })
  @IsOptional()
  @IsString()
  purchaseToken?: string;
}
