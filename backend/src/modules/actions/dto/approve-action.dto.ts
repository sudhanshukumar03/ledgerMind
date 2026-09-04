import { IsString, IsNotEmpty } from 'class-validator';

export class ApproveActionDto {
  @IsString()
  @IsNotEmpty()
  reason: string;
}

export class RejectActionDto {
  @IsString()
  @IsNotEmpty()
  reason: string;
}
