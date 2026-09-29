import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * A single chat turn coming from the client. Only `user` and `assistant`
 * roles are accepted — the service prepends its own trusted `system` prompt,
 * so a client must never be able to inject a `system` (or `tool`) message.
 */
export class ChatMessageDto {
  @IsIn(['user', 'assistant'])
  role: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(8000)
  content: string;
}

export class ChatDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  messages: ChatMessageDto[];
}
