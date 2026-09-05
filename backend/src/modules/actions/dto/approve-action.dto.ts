import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ApproveActionDto {
  @ApiProperty({ description: 'Reason for approving the action' })
  @IsString()
  @IsNotEmpty()
  reason: string;
}

export class RejectActionDto {
  @ApiProperty({ description: 'Reason for rejecting the action' })
  @IsString()
  @IsNotEmpty()
  reason: string;
}
