import { IsString, IsNotEmpty, IsEnum, IsObject, IsOptional } from 'class-validator';
import { ActionType } from '@prisma/client';

export class CreateActionDto {
  @IsString()
  @IsNotEmpty()
  exception_id: string;

  @IsEnum(ActionType)
  @IsNotEmpty()
  action_type: ActionType;

  @IsObject()
  @IsOptional()
  parameters?: Record<string, any>;
}
