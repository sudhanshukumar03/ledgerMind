import { IsArray, IsNotEmpty } from 'class-validator';

export class ChatDto {
  @IsArray()
  @IsNotEmpty()
  messages: any[];
}
