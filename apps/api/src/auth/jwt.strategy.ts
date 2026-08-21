import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/decorators/authenticated-user';
import { requireEnv } from '../config/require-env';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: requireEnv('JWT_SECRET'),
    });
  }

  /**
   * Resolves the request's user from the token's subject.
   *
   * Deliberately re-reads role and isActive from the database rather than
   * trusting the token, so a demotion or deactivation takes effect on the
   * next request instead of when the 7-day token expires.
   *
   * @param payload - Verified JWT claims.
   * @returns The authenticated user, or `null` for a missing or deactivated
   *          account, which Passport turns into a 401.
   */
  async validate(payload: JwtPayload): Promise<AuthenticatedUser | null> {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) return null;
    return { id: user.id, email: user.email, role: user.role, name: user.name };
  }
}
