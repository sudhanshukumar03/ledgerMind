import { IsString, IsNotEmpty, IsEnum, IsObject, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ActionType } from '@prisma/client';

export class CreateActionDto {
  @ApiProperty({ description: 'The UUID of the exception this action relates to' })
  @IsString()
  @IsNotEmpty()
  exception_id: string;

  @ApiProperty({ enum: ActionType, description: 'Type of action to perform' })
  @IsEnum(ActionType)
  @IsNotEmpty()
  action_type: ActionType;

  @ApiPropertyOptional({ description: 'Parameters required for the action (e.g. payment_id, amount)' })
  @IsObject()
  @IsOptional()
  parameters?: Record<string, any>;
}
