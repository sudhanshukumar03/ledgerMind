import { IsOptional, IsEnum, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ExceptionType, Severity, ExceptionStatus } from '@prisma/client';

export class QueryExceptionsDto {
    @IsOptional()
    @IsEnum(ExceptionType)
    type?: ExceptionType;

    @IsOptional()
    @IsEnum(Severity)
    severity?: Severity;

    @IsOptional()
    @IsEnum(ExceptionStatus)
    status?: ExceptionStatus;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number = 1;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    limit?: number = 10;
}
