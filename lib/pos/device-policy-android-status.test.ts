import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const plugin = readFileSync(join(
  process.cwd(),
  'android/app/src/main/java/com/rkjone/staff/RkjDevicePolicyPlugin.java',
), 'utf8').replace(/\r\n/g, '\n');

describe('RkjDevicePolicy host app version status', () => {
  it('reads the installed host package and reports both Android version fields', () => {
    expect(plugin).toContain('getPackageInfo(packageName, 0)');
    expect(plugin).toContain('packageInfo.getLongVersionCode()');
    expect(plugin).toContain('result.put("versionName", versionName)');
    expect(plugin).toContain('result.put("versionCode", versionCode)');
  });
});
