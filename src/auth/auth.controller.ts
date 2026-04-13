import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: { identifier?: string; email?: string; username?: string; password: string }) {
    const identifier = loginDto.identifier || loginDto.username || loginDto.email;
    const user = await this.authService.validateUser(
      identifier || '',
      loginDto.password,
    );
    return this.authService.login(user);
  }

  @Post('register')
  async register(
    @Body() registerDto: { email: string; password: string; role?: string },
  ) {
    const user = await this.authService.register(
      registerDto.email,
      registerDto.password,
      registerDto.role,
    );
    return this.authService.login(user);
  }
}
