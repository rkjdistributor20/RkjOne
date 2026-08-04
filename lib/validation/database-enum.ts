export function isDatabaseEnumValue<const T extends readonly string[]>(
 value: string,
 allowedValues: T,
): value is T[number] {
 return allowedValues.some((allowedValue) => allowedValue === value);
}
