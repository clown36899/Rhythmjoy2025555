import { afterEach, describe, expect, it } from 'vitest';
import {
  analyticsIpMatchesRule,
  isAnalyticsBotUserAgent,
  isAnalyticsDatacenterIp,
  isAnalyticsExcludedIpRow,
} from './analytics-purity.js';

const ORIGINAL_ENV = {
  ANALYTICS_EXCLUDED_IPS: process.env.ANALYTICS_EXCLUDED_IPS,
  ANALYTICS_EXCLUDED_IP_RANGES: process.env.ANALYTICS_EXCLUDED_IP_RANGES,
  ANALYTICS_KIOSK_IPS: process.env.ANALYTICS_KIOSK_IPS,
  ANALYTICS_KIOSK_IP_RANGES: process.env.ANALYTICS_KIOSK_IP_RANGES,
};

afterEach(() => {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('analytics bot and network purity filters', () => {
  it('matches exact, wildcard, and CIDR IP rules', () => {
    expect(analyticsIpMatchesRule('103.196.9.210', '103.196.8.0/22')).toBe(true);
    expect(analyticsIpMatchesRule('103.196.12.1', '103.196.8.0/22')).toBe(false);
    expect(analyticsIpMatchesRule('104.168.71.128', '104.168.*')).toBe(true);
    expect(analyticsIpMatchesRule('::ffff:74.125.215.64', '74.125.0.0/16')).toBe(true);
  });

  it('flags observed hosting and proxy-looking networks while leaving common Korean access networks alone', () => {
    expect(isAnalyticsDatacenterIp('103.196.9.210')).toBe(true);
    expect(isAnalyticsDatacenterIp('103.196.9.122')).toBe(true);
    expect(isAnalyticsDatacenterIp('103.4.250.160')).toBe(true);
    expect(isAnalyticsDatacenterIp('74.125.215.64')).toBe(true);
    expect(isAnalyticsDatacenterIp('104.168.71.128')).toBe(true);
    expect(isAnalyticsDatacenterIp('162.43.237.221')).toBe(true);

    expect(isAnalyticsDatacenterIp('1.222.115.100')).toBe(false);
    expect(isAnalyticsDatacenterIp('106.101.82.233')).toBe(false);
  });

  it('supports configured exact and CIDR exclusions', () => {
    process.env.ANALYTICS_EXCLUDED_IPS = '203.0.113.10';
    process.env.ANALYTICS_EXCLUDED_IP_RANGES = '198.51.100.0/24';

    expect(isAnalyticsExcludedIpRow({ client_ip: '203.0.113.10' })).toBe(true);
    expect(isAnalyticsExcludedIpRow({ client_ip: '198.51.100.88' })).toBe(true);
    expect(isAnalyticsExcludedIpRow({ client_ip: '198.51.101.88' })).toBe(false);
  });

  it('detects browser automation user agents', () => {
    expect(isAnalyticsBotUserAgent('Mozilla/5.0 HeadlessChrome/120.0')).toBe(true);
    expect(isAnalyticsBotUserAgent('Mozilla/5.0 selenium webdriver')).toBe(true);
  });
});
