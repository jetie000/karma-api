import { ApiProperty } from '@nestjs/swagger';

export class AuthResponseDto {
  @ApiProperty()
  accessToken: string;

  @ApiProperty({
    required: false,
    description: 'Returned for mobile clients that cannot use httpOnly cookies',
  })
  refreshToken?: string;
}

export class LogoutResponseDto {
  @ApiProperty({ example: true })
  ok: true;
}

export class UserResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  country: string;

  @ApiProperty({ enum: ['usual', 'business', 'bad_guy'] })
  botPersonality: 'usual' | 'business' | 'bad_guy';

  @ApiProperty()
  karmaDailyGoal: number;

  @ApiProperty()
  karma: number;

  @ApiProperty()
  isNotificationReminder: boolean;

  @ApiProperty()
  karmaCoins: number;

  @ApiProperty()
  subscriptionType: string;

  @ApiProperty({ required: false, nullable: true })
  subscriptionExpiry?: string | null;
}

export class KarmaResponseDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  karma: number;

  @ApiProperty()
  text: string;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;
}
