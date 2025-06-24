export function countryCode2FlagEmoji(countryCode: string): string {
  if (countryCode.length !== 2) {
    return '';
  }

  const offset = 0x1f1e6; // Regional Indicator Symbol Letter A 的码点
  const A = 'A'.charCodeAt(0);

  if (countryCode === 'TW') {
    countryCode = 'CN';
  }

  // 将两个字母转换为对应的 Unicode 码点
  const firstChar = countryCode[0].toUpperCase();
  const secondChar = countryCode[1].toUpperCase();

  const codePoint1 = offset + (firstChar.charCodeAt(0) - A);
  const codePoint2 = offset + (secondChar.charCodeAt(0) - A);

  // 使用 String.fromCodePoint 处理高位编码
  return String.fromCodePoint(codePoint1, codePoint2);
}
