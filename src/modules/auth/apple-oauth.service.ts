import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys';

const appleJwks = createRemoteJWKSet(new URL(APPLE_JWKS_URL));

export type AppleUserProfile = {
  sub: string;
  email: string;
  name: string;
};

interface AppleTokenClaims {
  sub: string;
  email?: string;
  email_verified?: boolean | string;
  aud: string | string[];
  iss: string;
}

@Injectable()
export class AppleOAuthService {
  async getProfileFromIdentityToken(
    identityToken: string,
    /** Full name provided by the client (only available on first sign-in) */
    fullName?: string | null,
  ): Promise<AppleUserProfile> {
    const bundleId =
      process.env.APPLE_BUNDLE_ID ?? 'com.biggoatssoft.karmatracker';

    let claims: AppleTokenClaims;
    try {
      const { payload } = await jwtVerify(identityToken, appleJwks, {
        issuer: APPLE_ISSUER,
        audience: bundleId,
      });
      claims = payload as unknown as AppleTokenClaims;
    } catch (err) {
      throw new UnauthorizedException(
        `Invalid Apple identity token: ${(err as Error).message}`,
      );
    }

    if (!claims.sub) {
      throw new UnauthorizedException('Apple token missing subject');
    }

    // Email can be absent on repeat sign-ins — caller must pass a stored email in that case
    const email = claims.email?.trim().toLowerCase() ?? '';

    const name =
      fullName?.trim() ||
      (email ? email.split('@')[0] : `user_${claims.sub.slice(0, 8)}`);

    return { sub: claims.sub, email, name };
  }
}
