import { plainToInstance, Type } from "class-transformer";
import { IsString, ValidateNested } from "class-validator";

export class ReferenceItem {
  @IsString()
  readonly source!: string;

  @IsString()
  readonly target!: string;
}

export class References {
  @ValidateNested()
  @Type(() => ReferenceItem)
  readonly glossary?: ReferenceItem[];

  @ValidateNested()
  @Type(() => ReferenceItem)
  preferences?: ReferenceItem[];
}

export const defaultReferences = plainToInstance(References, {
  glossary: [],
  preferences: [],
} satisfies Required<References>);
