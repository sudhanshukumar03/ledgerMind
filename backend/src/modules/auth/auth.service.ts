import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../database/prisma.service.js';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
    constructor(
        private prisma: PrismaService,
        private jwtService: JwtService,
    ) { }

    async validateUser(email: string, pass: string): Promise<any> {
        const user = await this.prisma.user.findUnique({ where: { email } });
        if (!user) {
            throw new UnauthorizedException('Invalid email or password');
        }

        const isPasswordValid = await bcrypt.compare(pass, user.passwordHash);
        if (!isPasswordValid) {
            throw new UnauthorizedException('Invalid email or password');
        }

        // Return user without password hash
        const { passwordHash, ...result } = user;
        return result;
    }

    async login(user: any) {
        const payload = { 
            userId: user.id, 
            email: user.email, 
            role: user.role, 
            merchantId: user.merchantId 
        };
        
        return {
            access_token: this.jwtService.sign(payload),
        };
    }
}
