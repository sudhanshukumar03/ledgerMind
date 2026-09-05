import { IsString, IsNotEmpty, IsOptional, IsISO8601 } from 'class-validator';

export class RunReconciliationDto {

    @IsOptional()
    @IsISO8601()
    dateFrom?: string;

    @IsOptional()
    @IsISO8601()
    dateTo?: string;
}
