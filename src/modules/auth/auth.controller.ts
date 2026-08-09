import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { AuthResponse } from '../../types';
import {
  ApiBody,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  AuthResponseDto,
  LogoutResponseDto,
} from '../../common/dto/api-response.dto';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { LoginWithGoogleDto } from './dto/login-with-google.dto';
import { LoginWithAppleDto } from './dto/login-with-apple.dto';
import { SignUpDto } from './dto/sign-up.dto';

const REFRESH_COOKIE = 'refreshToken';

@ApiTags('auth')
@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @ApiOperation({ summary: 'Login with email/password' })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({
    description: 'Returns access token and sets refreshToken httpOnly cookie',
    type: AuthResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  async login(
    @Body() body: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const { auth, refreshToken } = await this.authService.login(
      body.email,
      body.password,
    );
    this.setRefreshCookie(res, refreshToken);
    return { ...auth, refreshToken };
  }

  @Post('signUp')
  @ApiOperation({ summary: 'Sign up with email/password' })
  @ApiBody({ type: SignUpDto })
  @ApiOkResponse({
    description: 'Returns access token and sets refreshToken httpOnly cookie',
    type: AuthResponseDto,
  })
  async signUp(
    @Body() body: SignUpDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const { auth, refreshToken } = await this.authService.signUp(
      body.email,
      body.name,
      body.password,
    );
    this.setRefreshCookie(res, refreshToken);
    return { ...auth, refreshToken };
  }

  @Post('loginWithGoogle')
  @ApiOperation({ summary: 'Login with Google access token' })
  @ApiBody({ type: LoginWithGoogleDto })
  @ApiOkResponse({
    description:
      'Returns access token and sets refreshToken httpOnly cookie; links with existing email account when matched',
    type: AuthResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Invalid/expired Google token' })
  async loginWithGoogle(
    @Body() body: LoginWithGoogleDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const { auth, refreshToken } = await this.authService.loginWithGoogle(
      body.accessTokenGoogle,
    );
    this.setRefreshCookie(res, refreshToken);
    return { ...auth, refreshToken };
  }

  @Post('loginWithApple')
  @ApiOperation({ summary: 'Login with Apple identity token' })
  @ApiBody({ type: LoginWithAppleDto })
  @ApiOkResponse({
    description: 'Returns access token and sets refreshToken httpOnly cookie',
    type: AuthResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Invalid/expired Apple token' })
  async loginWithApple(
    @Body() body: LoginWithAppleDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const { auth, refreshToken } = await this.authService.loginWithApple(
      body.identityToken,
      body.fullName,
    );
    this.setRefreshCookie(res, refreshToken);
    return { ...auth, refreshToken };
  }

  @Post('refresh-token')
  @ApiOperation({ summary: 'Refresh access token using refresh cookie' })
  @ApiCookieAuth(REFRESH_COOKIE)
  @ApiOkResponse({
    description: 'Returns new access token and rotates refresh cookie',
    type: AuthResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Invalid refresh token' })
  async refreshToken(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() body: { refreshToken?: string },
  ): Promise<AuthResponse> {
    // Accept token from httpOnly cookie (web) or request body (mobile)
    const token =
      (req.cookies?.[REFRESH_COOKIE] as string | undefined) ??
      body.refreshToken;
    const { auth, refreshToken } = await this.authService.refresh(token);
    this.setRefreshCookie(res, refreshToken);
    return { ...auth, refreshToken };
  }

  /** Clears the httpOnly refresh cookie (browser clients). Client should also drop in-memory access token. */
  @Post('logout')
  @ApiOperation({ summary: 'Logout and clear refresh cookie' })
  @ApiOkResponse({ type: LogoutResponseDto })
  logout(@Res({ passthrough: true }) res: Response): { ok: true } {
    this.clearRefreshCookie(res);
    return { ok: true };
  }

  private setRefreshCookie(res: Response, refreshToken: string): void {
    const maxAge = 7 * 24 * 60 * 60 * 1000;
    res.cookie(REFRESH_COOKIE, refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge,
      path: '/',
    });
  }

  private clearRefreshCookie(res: Response): void {
    res.clearCookie(REFRESH_COOKIE, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });
  }
}
