import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { UserResponseDto } from '../../common/dto/api-response.dto';
import { CurrentUserId } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { User } from '../../types';
import { UpdateUserDto } from './dto/update-user.dto';
import { ActivateSubscriptionDto } from './dto/activate-subscription.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('getUser')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get current authenticated user' })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiUnauthorizedResponse()
  getUser(@CurrentUserId() userId: string): Promise<User> {
    return this.usersService.getPublicUser(userId);
  }

  @Patch('updateUser')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update current user settings' })
  @ApiBody({ type: UpdateUserDto })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiUnauthorizedResponse()
  updateUser(
    @CurrentUserId() userId: string,
    @Body() body: UpdateUserDto,
  ): Promise<User> {
    return this.usersService.updateUser(userId, body);
  }

  @Post('activateSubscription')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Activate Pro or Pro+ subscription after in-app purchase',
  })
  @ApiBody({ type: ActivateSubscriptionDto })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiUnauthorizedResponse()
  activateSubscription(
    @CurrentUserId() userId: string,
    @Body() body: ActivateSubscriptionDto,
  ): Promise<User> {
    return this.usersService.activateSubscription(
      userId,
      body.subscriptionType,
    );
  }
}
