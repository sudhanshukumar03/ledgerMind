import { Controller, Post, Body, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { Throttle } from '@nestjs/throttler';
import { THROTTLE } from '../../common/throttler/throttler.config.js';

@Controller('auth')
export class AuthController {
    constructor(private authService: AuthService) { }

    @Public()
    @Post('login')
    @Throttle({ default: THROTTLE.LOGIN })
    async login(@Body() loginDto: LoginDto) {
        const user = await this.authService.validateUser(loginDto.email, loginDto.password);
        return this.authService.login(user);
    }
}
