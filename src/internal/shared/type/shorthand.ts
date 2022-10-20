export const enum ShorthandType {
  NULL = '0',
  STRING = '1',
  NUMBER = '2',
  OBJECT = '3',
  ARRAY = '4',
  MAP = '5',
  SET = '6',
  SYMBOL = '7',
  BOOLEAN = '8',
  FUNCTION = '9',
  UNDEFINED = '10',
  BIGINT = '11',
  DATE = '12',
}

export type ShorthandToInstance <T extends ShorthandType> =
  | T extends ShorthandType.OBJECT ? Record<string | symbol | number, any> 
  : T extends ShorthandType.ARRAY  ? Array<any> 
  : T extends ShorthandType.SET ? Set<any>
  : T extends ShorthandType.MAP ? Map<any, any>
  : T extends ShorthandType.NULL ? null
  : T extends ShorthandType.UNDEFINED ? undefined
  : T extends ShorthandType.BOOLEAN ? boolean
  : T extends ShorthandType.SYMBOL ? symbol
  : T extends ShorthandType.NUMBER ? number
  : T extends ShorthandType.STRING ? string
  : T extends ShorthandType.BIGINT ? bigint
  : T extends ShorthandType.DATE ? Date
  : never
