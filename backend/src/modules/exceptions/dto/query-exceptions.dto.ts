import { IsOptional, IsEnum, IsInt, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ExceptionType, Severity, ExceptionStatus } from '@prisma/client';

export class QueryExceptionsDto {
    @ApiPropertyOptional({ enum: ExceptionType, description: 'Filter by exception type' })
    @IsOptional()
    @IsEnum(ExceptionType)
    type?: ExceptionType;

    @ApiPropertyOptional({ enum: Severity, description: 'Filter by severity' })
    @IsOptional()
    @IsEnum(Severity)
    severity?: Severity;

    @ApiPropertyOptional({ enum: ExceptionStatus, description: 'Filter by status' })
    @IsOptional()
    @IsEnum(ExceptionStatus)
    status?: ExceptionStatus;

    @ApiPropertyOptional({ description: 'Page number for pagination', minimum: 1, default: 1 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number = 1;

    @ApiPropertyOptional({ description: 'Number of items per page', minimum: 1, default: 10 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    limit?: number = 10;
}
