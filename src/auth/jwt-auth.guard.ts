import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers?.authorization as string | undefined;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing authorization token');
    }

    const token = authHeader.slice(7);
    const secret = this.configService.get<string>(
      'JWT_SECRET',
      'your-secret-key-change-in-production',
    );

    try {
      const payload = jwt.verify(token, secret) as {
        sub: string;
        email: string;
        role: string;
      };

      request.user = {
        id: payload.sub,
        email: payload.email,
        role: payload.role,
      };

      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('JWT verification failed:', message);
      throw new UnauthorizedException('Invalid token');
    }
  }
}
